package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardTaskStore;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JdbcBoardTaskStore implements BoardTaskStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String ACTIVE = "(e.status = ANY(?::text[]) OR r.verification_snapshot->>'status' = ANY(?::text[]))";
    private static final String CODE_ACTIVE = "SELECT 1 FROM eap.code_proposal p JOIN eap.code_generation g ON g.id=p.generation_id WHERE p.status = ANY(?::text[]) AND g.task_id=";
    private static final String SELECT = "SELECT b.*, (EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id WHERE r.task_id=b.id AND " + ACTIVE + ") OR EXISTS (" + CODE_ACTIVE + "b.id)) AS execution_active FROM eap.board_task b";
    private static final RowMapper<TaskRow> ROW = (rs, row) -> new TaskRow(rs.getObject("id", UUID.class),
            rs.getString("project_id"), rs.getString("title"), rs.getString("column_id"), rs.getString("notes"),
            rs.getString("session_id"), rs.getLong("revision"), Arrays.asList(JSON.readValue(rs.getString("events"), String[].class)),
            rs.getString("priority"), rs.getString("goal"), rs.getString("acceptance_criteria"), rs.getBoolean("execution_active"), rs.getObject("prototype_version_id", UUID.class));
    private final JdbcTemplate jdbc;

    public JdbcBoardTaskStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<TaskRow> list(String projectId) {
        return jdbc.query(SELECT + " WHERE project_id=? ORDER BY created_at DESC LIMIT 200", ROW,
                StateBindings.MISSION_ACTIVE, StateBindings.VERIFICATION_BLOCKING, StateBindings.CODE_BLOCKING, projectId);
    }

    @Override
    public Optional<TaskRow> find(UUID id, String projectId, boolean lock) {
        var rows = jdbc.query(SELECT + " WHERE id=? AND project_id=?" + (lock ? " FOR UPDATE" : ""), ROW,
                StateBindings.MISSION_ACTIVE, StateBindings.VERIFICATION_BLOCKING, StateBindings.CODE_BLOCKING, id, projectId);
        return rows.stream().findFirst();
    }

    @Override
    public Optional<TaskRow> findByRequest(String projectId, UUID requestId) {
        var rows = jdbc.query(SELECT + " WHERE project_id=? AND request_id=?", ROW,
                StateBindings.MISSION_ACTIVE, StateBindings.VERIFICATION_BLOCKING, StateBindings.CODE_BLOCKING, projectId, requestId);
        return rows.stream().findFirst();
    }

    @Override
    public void insert(UUID id, String projectId, String title, String sessionId, String column, String goal,
                       String acceptanceCriteria, UUID requestId, String fingerprint, UUID prototypeId) {
        jdbc.update("INSERT INTO eap.board_task(id,project_id,title,session_id,column_id,goal,acceptance_criteria,request_id,request_fingerprint,prototype_version_id) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (project_id,request_id) DO NOTHING",
                id, projectId, title, sessionId, column, goal, acceptanceCriteria, requestId, fingerprint, prototypeId);
    }

    @Override
    public String findFingerprint(String projectId, UUID requestId) {
        return jdbc.queryForObject("SELECT request_fingerprint FROM eap.board_task WHERE project_id=? AND request_id=?", String.class, projectId, requestId);
    }

    @Override
    public void update(UUID id, String projectId, String column, String notes, String priority,
                       String goal, String acceptanceCriteria, List<String> events) {
        jdbc.update("UPDATE eap.board_task SET column_id=?,notes=?,priority=?,goal=?,acceptance_criteria=?,revision=revision+1,events=?::jsonb WHERE id=? AND project_id=?",
                column, notes, priority, goal, acceptanceCriteria, JSON.writeValueAsString(events), id, projectId);
    }

    @Override
    public boolean transition(UUID id, long revision, String target, List<String> events) {
        return jdbc.update("UPDATE eap.board_task SET column_id=?,revision=revision+1,events=?::jsonb WHERE id=? AND revision=?",
                target, JSON.writeValueAsString(events), id, revision) == 1;
    }

    @Override
    public boolean hasActiveExecution(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id WHERE r.task_id=? AND " + ACTIVE + ") OR EXISTS (" + CODE_ACTIVE + "?)", Boolean.class,
                id, StateBindings.MISSION_ACTIVE, StateBindings.VERIFICATION_BLOCKING, StateBindings.CODE_BLOCKING, id));
    }

    @Override
    public boolean hasActiveWorkspace(String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id WHERE lower(e.workspace_path)=lower(?) AND " + ACTIVE + ")", Boolean.class,
                workspace, StateBindings.MISSION_ACTIVE, StateBindings.VERIFICATION_BLOCKING));
    }

    @Override
    public boolean hasActiveVerification(String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM eap.board_task_run r WHERE lower(COALESCE(r.verification_snapshot->'plan'->>'workspacePath', r.verification_snapshot->>'workspacePath'))=lower(?) AND r.verification_snapshot->>'status' = ANY(?::text[]))", Boolean.class,
                workspace, StateBindings.VERIFICATION_BLOCKING));
    }
}
