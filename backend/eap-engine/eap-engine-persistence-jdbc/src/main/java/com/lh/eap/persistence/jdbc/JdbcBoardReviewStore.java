package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardReviewStore;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcBoardReviewStore implements BoardReviewStore {
    private final JdbcTemplate jdbc;

    public JdbcBoardReviewStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Optional<SnapshotRow> findSnapshot(UUID taskId, UUID executionId) {
        return jdbc.query("SELECT review_snapshot FROM eap.board_task_run WHERE task_id=? AND execution_id=?",
                (rs, row) -> new SnapshotRow(rs.getString(1)), taskId, executionId).stream().findFirst();
    }

    @Override
    public void saveSnapshotIfAbsent(String json, UUID taskId, UUID executionId) {
        jdbc.update("UPDATE eap.board_task_run SET review_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND review_snapshot IS NULL",
                json, taskId, executionId);
    }
}
