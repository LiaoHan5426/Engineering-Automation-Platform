package com.lh.eap.application.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** One repository-local authority, shared by Board and Chat. Task locks (if any) come first.
 * Never hold this transaction over a filesystem write: commit the durable active intent instead. */
public final class WorkspaceInterlock {
    private WorkspaceInterlock() {}
    public static void lock(JdbcTemplate jdbc, String workspace) {
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Workspace reservation requires a transaction");
        jdbc.query("SELECT pg_advisory_xact_lock(hashtextextended(lower(?), 791621))", rs -> { }, workspace);
    }
    public static boolean codeActive(JdbcTemplate jdbc, String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS (SELECT 1 FROM eap.code_proposal WHERE lower(workspace)=lower(?) AND status IN ('APPLYING','UNKNOWN'))", Boolean.class, workspace));
    }
    public static boolean boardActive(JdbcTemplate jdbc, String workspace) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            SELECT EXISTS (SELECT 1 FROM eap.board_task_run r JOIN eap.mission_execution e ON e.id=r.execution_id
              WHERE (lower(e.workspace_path)=lower(?) AND e.status IN ('CREATED','RUNNING','CANCELLING'))
                 OR (lower(COALESCE(r.verification_snapshot->'plan'->>'workspacePath', r.verification_snapshot->>'workspacePath'))=lower(?)
                     AND r.verification_snapshot->>'status' IN ('QUEUED','RUNNING','UNKNOWN')))
            """, Boolean.class, workspace, workspace));
    }
}
