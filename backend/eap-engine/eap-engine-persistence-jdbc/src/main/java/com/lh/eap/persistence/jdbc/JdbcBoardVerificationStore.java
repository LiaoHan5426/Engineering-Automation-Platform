package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardVerificationStore;
import com.lh.eap.domain.model.BoardVerificationStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcBoardVerificationStore implements BoardVerificationStore {
    private final JdbcTemplate jdbc;

    public JdbcBoardVerificationStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<SnapshotRow> findSnapshot(UUID taskId, UUID executionId) {
        return jdbc.query("SELECT verification_snapshot FROM eap.board_task_run WHERE task_id=? AND execution_id=?",
                (rs, row) -> new SnapshotRow(rs.getString(1)), taskId, executionId).stream().findFirst();
    }

    @Override
    public boolean saveIfAbsent(String json, UUID taskId, UUID executionId) {
        return jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot IS NULL",
                json, taskId, executionId) == 1;
    }

    @Override
    public boolean saveIfStatus(String json, UUID taskId, UUID executionId, String expectedStatus) {
        return jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status'=?",
                json, taskId, executionId, expectedStatus) == 1;
    }

    @Override
    public boolean markPassedUnknown(UUID taskId, UUID executionId, String reason) {
        return jdbc.update("""
                UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(jsonb_set(
                    verification_snapshot,'{status}',to_jsonb(?::text)),'{reason}',to_jsonb(?::text)),'{finishedAt}','null'::jsonb)
                WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status'='PASSED'
                """, BoardVerificationStatus.UNKNOWN.wire(), reason, taskId, executionId) == 1;
    }

    @Override
    public void markUnknown(UUID taskId, UUID executionId, String reason) {
        jdbc.update("""
                UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(
                    verification_snapshot,'{status}',to_jsonb(?::text)),'{reason}',to_jsonb(?::text))
                WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status' = ANY(?::text[])
                """, BoardVerificationStatus.UNKNOWN.wire(), reason, taskId, executionId, StateBindings.VERIFICATION_ACTIVE);
    }

    @Override
    public void markRestartUnknown(String reason) {
        jdbc.update("""
                UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(
                    verification_snapshot,'{status}',to_jsonb(?::text)),'{reason}',to_jsonb(?::text))
                WHERE verification_snapshot->>'status' = ANY(?::text[])
                """, BoardVerificationStatus.UNKNOWN.wire(), reason, StateBindings.VERIFICATION_ACTIVE);
    }
}
