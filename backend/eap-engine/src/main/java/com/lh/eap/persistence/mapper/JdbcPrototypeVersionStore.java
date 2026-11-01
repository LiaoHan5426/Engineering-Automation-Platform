package com.lh.eap.persistence.mapper;

import com.lh.eap.application.service.PrototypeVersion;
import com.lh.eap.application.service.PrototypeVersionStore;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JdbcPrototypeVersionStore implements PrototypeVersionStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SELECT = """
            SELECT id, source_ref, title, body, button_presses, interaction, acceptance, content_hash, created_at
            FROM eap.prototype_version
            """;
    private final JdbcTemplate jdbc;

    public JdbcPrototypeVersionStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void insert(PrototypeVersion version) {
        jdbc.update(
                """
                INSERT INTO eap.prototype_version(
                    id, source_ref, title, body, button_presses, interaction, acceptance, content_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                version.id(), version.sourceRef(), version.title(), version.body(), version.buttonPresses(),
                version.interaction(), JSON.writeValueAsString(version.acceptance()), version.contentHash(),
                Timestamp.from(version.createdAt()));
    }

    @Override
    public Optional<PrototypeVersion> find(UUID id) {
        return jdbc.query(SELECT + " WHERE id = ?", (rs, row) -> map(rs), id).stream().findFirst();
    }

    @Override
    public List<PrototypeVersion> list(String sourceRef) {
        return jdbc.query(SELECT + " WHERE source_ref = ? ORDER BY created_at DESC", (rs, row) -> map(rs), sourceRef);
    }

    private static PrototypeVersion map(java.sql.ResultSet rs) throws java.sql.SQLException {
        var acceptance = List.of(JSON.readValue(rs.getString("acceptance"), String[].class));
        return new PrototypeVersion(
                rs.getObject("id", UUID.class),
                rs.getString("source_ref"),
                rs.getString("title"),
                rs.getString("body"),
                rs.getInt("button_presses"),
                rs.getString("interaction"),
                List.copyOf(acceptance),
                rs.getString("content_hash"),
                rs.getTimestamp("created_at").toInstant());
    }
}
