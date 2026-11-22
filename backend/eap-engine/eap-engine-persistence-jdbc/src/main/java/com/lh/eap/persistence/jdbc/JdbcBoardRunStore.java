package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardRunStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcBoardRunStore implements BoardRunStore {
    private final JdbcTemplate jdbc;

    public JdbcBoardRunStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Row> list(UUID taskId) {
        return jdbc.query("SELECT * FROM eap.board_task_run WHERE task_id=? ORDER BY created_at DESC, execution_id DESC LIMIT 30",
            JdbcBoardRunStore::row, taskId);
    }

    @Override
    public List<Row> findByRequest(UUID taskId, UUID requestId) {
        return jdbc.query("SELECT * FROM eap.board_task_run WHERE task_id=? AND request_id=?",
            JdbcBoardRunStore::row, taskId, requestId);
    }

    @Override
    public void insert(UUID executionId, UUID taskId, UUID requestId, long taskRevision, String taskSnapshotJson) {
        jdbc.update("INSERT INTO eap.board_task_run(execution_id,task_id,request_id,task_revision,task_snapshot) VALUES (?,?,?,?,?::jsonb)",
            executionId, taskId, requestId, taskRevision, taskSnapshotJson);
    }

    private static Row row(ResultSet rs, int index) throws SQLException {
        return new Row(rs.getObject("request_id", UUID.class), rs.getLong("task_revision"),
            rs.getString("task_snapshot"), rs.getObject("execution_id", UUID.class));
    }
}
