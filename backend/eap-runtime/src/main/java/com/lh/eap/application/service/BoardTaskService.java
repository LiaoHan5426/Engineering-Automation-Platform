package com.lh.eap.application.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.lh.eap.common.SensitiveData;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Durable preparation only: no process ownership, execution or acceptance is inferred. */
@Service
public class BoardTaskService {
    public record Task(UUID id, String projectId, String title, String column, String notes,
                       String sessionId, long revision, List<String> events, String priority,
                       String goal, String acceptanceCriteria, boolean executionActive, UUID prototypeVersionId) {
        @JsonProperty public List<String> preparationIssues() { return missing(goal, acceptanceCriteria); }
        @JsonProperty public List<String> allowedColumns() {
            if (executionActive || !Set.of("planned", "ready").contains(column)) return List.of();
            return preparationIssues().isEmpty() ? List.of("planned", "ready") : List.of("planned");
        }
    }
    public record Draft(String projectId, String title, String sessionId, String column,
                        String goal, String acceptanceCriteria, UUID requestId) {}
    public record Update(String projectId, long revision, String column, String notes, String priority,
                         String goal, String acceptanceCriteria) {}
    private static final String ACTIVE = "(e.status IN ('CREATED','RUNNING','CANCELLING') OR r.verification_snapshot->>'status' IN ('QUEUED','RUNNING','UNKNOWN'))";
    private static final String SELECT = "SELECT b.*, EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id WHERE r.task_id=b.id AND " + ACTIVE + ") AS execution_active FROM eap.board_task b";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final RowMapper<Task> ROW = (rs, row) -> new Task(rs.getObject("id", UUID.class),
            rs.getString("project_id"), rs.getString("title"), rs.getString("column_id"), rs.getString("notes"),
            rs.getString("session_id"), rs.getLong("revision"), Arrays.asList(JSON.readValue(rs.getString("events"), String[].class)),
            rs.getString("priority"), rs.getString("goal"), rs.getString("acceptance_criteria"), rs.getBoolean("execution_active"), rs.getObject("prototype_version_id", UUID.class));
    private final JdbcTemplate jdbc;
    public BoardTaskService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<Task> list(String projectId) {
        require(projectId, 120);
        return jdbc.query(SELECT + " WHERE project_id=? ORDER BY created_at DESC LIMIT 200", ROW, projectId);
    }

    @Transactional public Task create(Draft draft) {
        require(draft.projectId(), 120); require(draft.title(), 200);
        if (draft.requestId() == null) throw new IllegalArgumentException("BOARD_REQUEST_ID_REQUIRED");
        String sessionId = draft.sessionId() == null ? "" : draft.sessionId();
        if (sessionId.length() > 120) throw new IllegalArgumentException("SESSION_ID_TOO_LONG");
        String column = draft.column() == null ? "planned" : draft.column();
        if (!Set.of("planned", "ready").contains(column)) throw new IllegalArgumentException("INVALID_BOARD_INITIAL_COLUMN");
        String title = text(draft.title().trim(), 200);
        String goal = text(draft.goal(), 4000), criteria = text(draft.acceptanceCriteria(), 4000);
        requireReady(column, goal, criteria);
        // The original normalized request digest is stable across subsequent task edits.
        String fingerprint = fingerprint(List.of(draft.projectId(), title, sessionId, column, goal, criteria));
        jdbc.update("INSERT INTO eap.board_task(id,project_id,title,session_id,column_id,goal,acceptance_criteria,request_id,request_fingerprint) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT (project_id,request_id) DO NOTHING",
                UUID.randomUUID(), draft.projectId(), title, sessionId, column, goal, criteria, draft.requestId(), fingerprint);
        var tasks = jdbc.query(SELECT + " WHERE project_id=? AND request_id=?", ROW, draft.projectId(), draft.requestId());
        String savedFingerprint = jdbc.queryForObject("SELECT request_fingerprint FROM eap.board_task WHERE project_id=? AND request_id=?", String.class, draft.projectId(), draft.requestId());
        if (!fingerprint.equals(savedFingerprint)) throw conflict("BOARD_REQUEST_CONFLICT");
        return tasks.getFirst();
    }

    @Transactional public Task update(UUID id, Update update) {
        require(update.projectId(), 120);
        if (update.revision() < 1) throw new IllegalArgumentException("INVALID_BOARD_REVISION");
        Task current = find(id, update.projectId(), true);
        if (current.revision() != update.revision()) throw conflict("BOARD_REVISION_CONFLICT");
        if (hasActiveExecution(id)) throw conflict("BOARD_EXECUTION_ACTIVE");
        String target = update.column() == null ? current.column() : update.column();
        if (!allowed(current.column(), target)) throw conflict("BOARD_EXECUTION_EVIDENCE_REQUIRED");
        String notes = update.notes() == null ? current.notes() : text(update.notes(), 4000);
        String goal = update.goal() == null ? current.goal() : text(update.goal(), 4000);
        String criteria = update.acceptanceCriteria() == null ? current.acceptanceCriteria() : text(update.acceptanceCriteria(), 4000);
        String priority = update.priority() == null ? current.priority() : validatePriority(update.priority());
        requireReady(target, goal, criteria);
        List<String> events = new ArrayList<>(current.events());
        if (!target.equals(current.column())) events.add(target);
        if (!notes.equals(current.notes())) events.add("notes_updated");
        if (!priority.equals(current.priority())) events.add("priority_updated");
        if (!goal.equals(current.goal()) || !criteria.equals(current.acceptanceCriteria())) events.add("preparation_updated");
        if (events.size() == current.events().size()) return current;
        jdbc.update("UPDATE eap.board_task SET column_id=?,notes=?,priority=?,goal=?,acceptance_criteria=?,revision=revision+1,events=?::jsonb WHERE id=? AND project_id=?",
                target, notes, priority, goal, criteria, JSON.writeValueAsString(events), id, update.projectId());
        return find(id, update.projectId(), false);
    }

    // Separate statement after locking the task: a waiter needs a fresh READ COMMITTED snapshot.
    boolean hasActiveExecution(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id WHERE r.task_id=? AND " + ACTIVE + ")", Boolean.class, id));
    }
    // All callers acquire the task row first, then this workspace lock: never the opposite order.
    void lockWorkspace(String workspace) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Workspace reservation requires a transaction");
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(lower(?), 791621))", rs -> { }, workspace);
    }
    boolean hasActiveWorkspace(String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id WHERE lower(e.workspace_path)=lower(?) AND " + ACTIVE + ")", Boolean.class, workspace));
    }
    boolean hasActiveVerification(String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM eap.board_task_run r WHERE lower(COALESCE(r.verification_snapshot->'plan'->>'workspacePath', r.verification_snapshot->>'workspacePath'))=lower(?) AND r.verification_snapshot->>'status' IN ('QUEUED','RUNNING','UNKNOWN'))", Boolean.class, workspace));
    }
    Task find(UUID id, String projectId, boolean lock) {
        var rows = jdbc.query(SELECT + " WHERE id=? AND project_id=?" + (lock ? " FOR UPDATE" : ""), ROW, id, projectId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "BOARD_TASK_NOT_FOUND");
        return rows.getFirst();
    }
    public static boolean allowed(String from, String to) {
        return Set.of("planned", "ready").contains(from) && Set.of("planned", "ready").contains(to);
    }
    public static String validatePriority(String value) {
        if (value == null || !Set.of("none", "p0", "p1", "p2").contains(value)) throw new IllegalArgumentException("INVALID_BOARD_PRIORITY");
        return value;
    }
    private static List<String> missing(String goal, String criteria) {
        List<String> issues = new ArrayList<>();
        if (goal.isBlank()) issues.add("goal");
        if (criteria.isBlank()) issues.add("acceptanceCriteria");
        return List.copyOf(issues);
    }
    private static void requireReady(String column, String goal, String criteria) {
        if (column.equals("ready") && !missing(goal, criteria).isEmpty()) throw conflict("BOARD_PREPARATION_REQUIRED");
    }
    private static String text(String value, int limit) {
        if (value == null) return "";
        if (value.length() > limit) throw new IllegalArgumentException("BOARD_TEXT_TOO_LONG");
        var safe = SensitiveData.redact(value);
        if (safe.length() > limit) throw new IllegalArgumentException("BOARD_TEXT_TOO_LONG");
        return safe;
    }
    private static String fingerprint(List<String> fields) {
        try {
            return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(JSON.writeValueAsString(fields).getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
    private static void require(String value, int limit) { if (value == null || value.isBlank() || value.length() > limit) throw new IllegalArgumentException("INVALID_BOARD_FIELD"); }
}
