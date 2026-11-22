package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.ScenarioStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JdbcScenarioStore implements ScenarioStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SELECT = "SELECT id,revision,definition::text AS definition FROM eap.scenario_definition";
    private final JdbcTemplate jdbc;

    public JdbcScenarioStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public long countPrototypeVersions() {
        return jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version WHERE source_ref IN ('builder-alpha','builder-beta')", Long.class);
    }

    @Override
    public List<Snapshot> list() {
        return jdbc.query(SELECT + " WHERE NOT deleted ORDER BY id", (rs, row) -> map(rs));
    }

    @Override
    public Optional<Snapshot> find(String id) {
        return jdbc.query(SELECT + " WHERE id=? AND NOT deleted", (rs, row) -> map(rs), id).stream().findFirst();
    }

    @Override
    public Optional<Snapshot> insert(String id, String definitionJson) {
        return jdbc.query("""
                INSERT INTO eap.scenario_definition(id,revision,definition) VALUES (?,1,?::jsonb)
                ON CONFLICT(id) DO NOTHING RETURNING id,revision,definition::text AS definition
                """, (rs, row) -> map(rs), id, definitionJson).stream().findFirst();
    }

    @Override
    public Optional<Snapshot> update(String id, long revision, String definitionJson) {
        return jdbc.query("""
                UPDATE eap.scenario_definition SET definition=?::jsonb,revision=revision+1,updated_at=now()
                WHERE id=? AND revision=? AND NOT deleted RETURNING id,revision,definition::text AS definition
                """, (rs, row) -> map(rs), definitionJson, id, revision).stream().findFirst();
    }

    @Override
    public boolean delete(String id, long revision) {
        return jdbc.update("UPDATE eap.scenario_definition SET deleted=true,revision=revision+1,updated_at=now() WHERE id=? AND revision=? AND NOT deleted", id, revision) == 1;
    }

    private static Snapshot map(ResultSet rs) throws SQLException {
        return new Snapshot(rs.getString("id"), rs.getLong("revision"), JSON.readValue(rs.getString("definition"), Definition.class));
    }
}
