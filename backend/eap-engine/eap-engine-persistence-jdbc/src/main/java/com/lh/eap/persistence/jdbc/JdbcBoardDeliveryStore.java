package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardDeliveryStore;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcBoardDeliveryStore implements BoardDeliveryStore {
    private static final String SELECT = """
        SELECT delivery_snapshot,delivery_request_hash,delivery_decision_hash,task_revision,task_snapshot,verification_snapshot
        FROM eap.board_task_run WHERE task_id=? AND execution_id=?
        """;
    private final JdbcTemplate jdbc;

    public JdbcBoardDeliveryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Row find(UUID taskId, UUID executionId) {
        return jdbc.query(SELECT,
            (rs, row) -> new Row(rs.getString(1), rs.getString(2), rs.getString(3),
                rs.getLong(4), rs.getString(5), rs.getString(6)),
            taskId, executionId).stream().findFirst().orElse(null);
    }

    @Override
    public void saveDelivery(String deliveryJson, String requestHash, UUID taskId, UUID executionId) {
        jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=?::jsonb,delivery_request_hash=? WHERE task_id=? AND execution_id=?",
            deliveryJson, requestHash, taskId, executionId);
    }

    @Override
    public void saveDecision(String deliveryJson, String decisionHash, UUID taskId, UUID executionId) {
        jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=?::jsonb,delivery_decision_hash=? WHERE task_id=? AND execution_id=?",
            deliveryJson, decisionHash, taskId, executionId);
    }
}
