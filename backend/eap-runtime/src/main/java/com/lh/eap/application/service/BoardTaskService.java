package com.lh.eap.application.service;

import com.lh.eap.common.SensitiveData;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** User task drafts only. This service never starts a process or marks execution complete. */
@Service
public class BoardTaskService {
    public record Task(UUID id, String projectId, String title, String column, String notes, String sessionId, long revision, List<String> events, String priority) {}
    public record Draft(String projectId, String title, String sessionId, String column) {}
    public record Update(long revision, String column, String notes, String priority) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final RowMapper<Task> ROW = (rs, row) -> new Task(rs.getObject("id", UUID.class), rs.getString("project_id"), rs.getString("title"), rs.getString("column_id"), rs.getString("notes"), rs.getString("session_id"), rs.getLong("revision"), Arrays.asList(JSON.readValue(rs.getString("events"), String[].class)), rs.getString("priority"));
    private final JdbcTemplate jdbc;
    public BoardTaskService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public List<Task> list(String projectId) {
        require(projectId, 120);
        return jdbc.query("SELECT * FROM eap.board_task WHERE project_id=? ORDER BY created_at DESC LIMIT 200", ROW, projectId);
    }
    @Transactional public Task create(Draft draft) {
        require(draft.projectId(), 120); require(draft.title(), 200);
        String sessionId = draft.sessionId() == null ? "" : draft.sessionId();
        if (sessionId.length() > 120) throw new IllegalArgumentException("SESSION_ID_TOO_LONG");
        UUID id = UUID.randomUUID();
        String column = draft.column() == null ? "planned" : draft.column();
        if (!Set.of("planned", "ready").contains(column)) throw new IllegalArgumentException("INVALID_BOARD_INITIAL_COLUMN");
        jdbc.update("INSERT INTO eap.board_task(id,project_id,title,session_id,column_id) VALUES (?,?,?,?,?)", id, draft.projectId(), SensitiveData.redact(draft.title().trim()), sessionId, column);
        return find(id, false);
    }
    @Transactional public Task update(UUID id, Update update) {
        Task current = find(id, true);
        if (current.revision() != update.revision()) throw new ResponseStatusException(HttpStatus.CONFLICT, "BOARD_REVISION_CONFLICT");
        String target = update.column() == null ? current.column() : update.column();
        if (!allowed(current.column(), target)) throw new ResponseStatusException(HttpStatus.CONFLICT, "BOARD_EXECUTION_EVIDENCE_REQUIRED");
        String notes = update.notes() == null ? current.notes() : SensitiveData.redact(update.notes());
        if (notes.length() > 4000) throw new IllegalArgumentException("BOARD_NOTES_TOO_LONG");
        String priority = update.priority() == null ? current.priority() : validatePriority(update.priority());
        List<String> events = new ArrayList<>(current.events());
        if (!target.equals(current.column())) events.add(target);
        if (!notes.equals(current.notes())) events.add("notes_updated");
        if (!priority.equals(current.priority())) events.add("priority_updated");
        jdbc.update("UPDATE eap.board_task SET column_id=?,notes=?,priority=?,revision=revision+1,events=?::jsonb WHERE id=?", target, notes, priority, JSON.writeValueAsString(events), id);
        return find(id, false);
    }
    private Task find(UUID id, boolean lock) {
        var rows = jdbc.query("SELECT * FROM eap.board_task WHERE id=?" + (lock ? " FOR UPDATE" : ""), ROW, id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "BOARD_TASK_NOT_FOUND");
        return rows.getFirst();
    }
    public static boolean allowed(String from, String to) {
        return from.equals(to) || (from.equals("planned") && to.equals("ready")) || (from.equals("ready") && to.equals("planned"));
    }
    public static String validatePriority(String value) {
        if (value == null || !Set.of("none", "p0", "p1", "p2").contains(value)) throw new IllegalArgumentException("INVALID_BOARD_PRIORITY");
        return value;
    }
    private static void require(String value, int limit) { if (value == null || value.isBlank() || value.length() > limit) throw new IllegalArgumentException("INVALID_BOARD_FIELD"); }
}
