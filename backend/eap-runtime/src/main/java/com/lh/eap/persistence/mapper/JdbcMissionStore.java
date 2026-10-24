package com.lh.eap.persistence.mapper;

import com.lh.eap.application.service.Mission;
import com.lh.eap.application.service.MissionStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcMissionStore implements MissionStore {
    private static final String SELECT = """
            SELECT m.id, m.handoff_id, h.source, h.source_ref, h.summary,
                   m.status, m.execution, m.approval, m.grant_state, m.verification, m.created_at
            FROM eap.mission m
            JOIN eap.handoff h ON h.id = m.handoff_id
            """;
    private final JdbcTemplate jdbc;

    public JdbcMissionStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(Mission mission) {
        jdbc.update(
                """
                INSERT INTO eap.mission(id, handoff_id, status, execution, approval, verification, grant_state, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                mission.id(),
                mission.handoffId(),
                mission.status(),
                mission.execution(),
                mission.approval(),
                mission.verification(),
                mission.grant(),
                Timestamp.from(mission.createdAt()));
    }

    @Override
    public List<Mission> list() {
        return jdbc.query(SELECT + " ORDER BY m.created_at DESC LIMIT 100", (rs, row) -> map(rs));
    }

    @Override
    public Optional<Mission> find(UUID id) {
        return jdbc.query(SELECT + " WHERE m.id = ?", (rs, row) -> map(rs), id).stream().findFirst();
    }

    @Override
    public Optional<Mission> findByHandoff(UUID handoffId) {
        return jdbc.query(SELECT + " WHERE m.handoff_id = ?", (rs, row) -> map(rs), handoffId).stream().findFirst();
    }

    private static Mission map(ResultSet rs) throws SQLException {
        return new Mission(
                rs.getObject("id", UUID.class),
                rs.getObject("handoff_id", UUID.class),
                rs.getString("source"),
                rs.getString("source_ref"),
                rs.getString("summary"),
                rs.getString("status"),
                rs.getString("execution"),
                rs.getString("approval"),
                rs.getString("grant_state"),
                rs.getString("verification"),
                rs.getTimestamp("created_at").toInstant());
    }
}
