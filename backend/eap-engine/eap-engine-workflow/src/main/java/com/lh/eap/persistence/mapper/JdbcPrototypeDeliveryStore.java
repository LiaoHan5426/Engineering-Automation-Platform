package com.lh.eap.persistence.mapper;

import com.lh.eap.application.service.PrototypeDelivery;
import com.lh.eap.application.service.PrototypeDeliveryStore;
import java.sql.Timestamp;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcPrototypeDeliveryStore implements PrototypeDeliveryStore {
    private final JdbcTemplate jdbc;

    public JdbcPrototypeDeliveryStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(PrototypeDelivery delivery) {
        jdbc.update(
                """
                INSERT INTO eap.prototype_delivery(id, version_id, created_at)
                VALUES (?, ?, ?)
                """,
                delivery.id(), delivery.versionId(), Timestamp.from(delivery.createdAt()));
    }

    @Override
    public Optional<PrototypeDelivery> findByVersion(UUID versionId) {
        return jdbc.query(
                """
                SELECT id, version_id, created_at FROM eap.prototype_delivery WHERE version_id = ?
                """,
                (rs, row) -> new PrototypeDelivery(
                        rs.getObject("id", UUID.class),
                        rs.getObject("version_id", UUID.class),
                        rs.getTimestamp("created_at").toInstant()),
                versionId).stream().findFirst();
    }
}
