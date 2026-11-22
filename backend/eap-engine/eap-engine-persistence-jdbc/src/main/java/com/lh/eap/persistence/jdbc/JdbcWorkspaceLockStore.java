package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.WorkspaceLockStore;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** Workspace reservation SQL only; the transaction and busy rules stay in the service layer. */
@Repository
public class JdbcWorkspaceLockStore implements WorkspaceLockStore {
    private final JdbcTemplate jdbc;

    public JdbcWorkspaceLockStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void lock(String workspace) {
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(lower(?), 791621))", rs -> { }, workspace);
    }

    @Override
    public boolean codeActive(String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM eap.code_proposal WHERE lower(workspace)=lower(?) AND status = ANY(?::text[]))",
                Boolean.class, workspace, StateBindings.CODE_BLOCKING));
    }

    @Override
    public boolean boardActive(String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id
              WHERE (lower(e.workspace_path)=lower(?) AND e.status = ANY(?::text[]))
                 OR (lower(COALESCE(r.verification_snapshot->'plan'->>'workspacePath', r.verification_snapshot->>'workspacePath'))=lower(?)
                     AND r.verification_snapshot->>'status' = ANY(?::text[])))
            """, Boolean.class, workspace, StateBindings.MISSION_ACTIVE, workspace, StateBindings.VERIFICATION_BLOCKING));
    }
}
