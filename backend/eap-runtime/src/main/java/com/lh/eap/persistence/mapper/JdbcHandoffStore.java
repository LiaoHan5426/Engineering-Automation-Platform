package com.lh.eap.persistence.mapper;

import com.lh.eap.application.service.Handoff;
import com.lh.eap.application.service.HandoffStore;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcHandoffStore implements HandoffStore {
    private final JdbcTemplate jdbc;

    public JdbcHandoffStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(Handoff handoff) {
        jdbc.update(
                """
                INSERT INTO eap.handoff(id, source, source_ref, summary, status, execution, approval, grant_state, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                handoff.id(),
                handoff.source(),
                handoff.sourceRef(),
                handoff.summary(),
                handoff.status(),
                handoff.execution(),
                handoff.approval(),
                handoff.grant(),
                Timestamp.from(handoff.createdAt()));
    }

    @Override
    public List<Handoff> list() {
        return jdbc.query(
                """
                SELECT id, source, source_ref, summary, status, execution, approval, grant_state, created_at
                FROM eap.handoff ORDER BY created_at DESC LIMIT 100
                """,
                (rs, row) -> map(rs));
    }

    @Override
    public Optional<Handoff> find(UUID id) {
        var rows = jdbc.query(
                """
                SELECT id, source, source_ref, summary, status, execution, approval, grant_state, created_at
                FROM eap.handoff WHERE id = ?
                """,
                (rs, row) -> map(rs),
                id);
        return rows.stream().findFirst();
    }

    private static Handoff map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Handoff(
                rs.getObject("id", UUID.class),
                rs.getString("source"),
                rs.getString("source_ref"),
                rs.getString("summary"),
                rs.getString("status"),
                rs.getString("execution"),
                rs.getString("approval"),
                rs.getString("grant_state"),
                rs.getTimestamp("created_at").toInstant());
    }
}
