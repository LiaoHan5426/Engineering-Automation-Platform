package com.lh.eap.persistence.mapper;

import com.lh.eap.application.service.ToolExecution;
import com.lh.eap.application.service.ToolExecutionStore;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.UnaryOperator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JdbcToolExecutionStore implements ToolExecutionStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SELECT = "SELECT snapshot::text FROM eap.tool_execution";
    private final JdbcTemplate jdbc;
    public JdbcToolExecutionStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override public void insert(ToolExecution row) {
        jdbc.update("""
                INSERT INTO eap.tool_execution(id,request_id,workspace_path,program_id,capability_id,status,snapshot)
                VALUES (?,?,?,?,?,?,?::jsonb)
                """, row.id(), row.requestId(), row.workspacePath(), row.programId(), row.capabilityId(),
                row.status(), JSON.writeValueAsString(row));
    }
    @Override public Optional<ToolExecution> find(UUID id) { return query(" WHERE id=?", id).stream().findFirst(); }
    @Override public Optional<ToolExecution> request(String workspace, UUID id) {
        return query(" WHERE workspace_path=? AND request_id=?", workspace, id).stream().findFirst();
    }
    @Override public List<ToolExecution> list(String workspace, String operation, int limit) {
        return query(" WHERE workspace_path=? AND capability_id=? ORDER BY created_at DESC,id DESC LIMIT ?", workspace, operation, limit);
    }
    @Override public Optional<ToolExecution> blocking(String workspace, String operation) {
        return query(" WHERE workspace_path=? AND capability_id=? AND status IN ('CREATED','RUNNING','CANCELLING','UNKNOWN')", workspace, operation)
                .stream().findFirst();
    }
    @Override @Transactional public ToolExecution update(UUID id, UnaryOperator<ToolExecution> transition) {
        var current = query(" WHERE id=? FOR UPDATE", id).stream().findFirst().orElseThrow();
        var next = transition.apply(current);
        jdbc.update("UPDATE eap.tool_execution SET status=?,snapshot=?::jsonb WHERE id=?",
                next.status(), JSON.writeValueAsString(next), id);
        return next;
    }
    @Override @Transactional public void markRestartUnknown() {
        // Unknown rows remain in the partial unique index; startup never replays or kills a PID.
        jdbc.update("""
                UPDATE eap.tool_execution SET status='UNKNOWN', snapshot=snapshot ||
                '{"status":"UNKNOWN","unconfirmedReason":"SERVICE_RESTART_EXIT_UNCONFIRMED"}'::jsonb
                WHERE status IN ('CREATED','RUNNING','CANCELLING')
                """);
    }
    private List<ToolExecution> query(String where, Object... args) {
        return jdbc.query(SELECT + where, (rs, row) -> JSON.readValue(rs.getString(1), ToolExecution.class), args);
    }
}
