package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.ExpertDefinitionStore;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** SQL only: validation, activation rules and transactions stay in ExpertDefinitionService. */
@Repository
public class JdbcExpertDefinitionStore implements ExpertDefinitionStore {
    private final JdbcTemplate jdbc;

    public JdbcExpertDefinitionStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Definition read(java.util.Map<String, Object> row) {
        return new Definition((String) row.get("manifest"), Boolean.TRUE.equals(row.get("enabled")),
                Boolean.TRUE.equals(row.get("builtin")));
    }

    @Override
    public Optional<Definition> find(String id) {
        return jdbc.queryForList("SELECT manifest::text AS manifest,enabled FROM eap.expert_definition WHERE id=?", id)
                .stream().findFirst().map(JdbcExpertDefinitionStore::read);
    }

    @Override
    public Optional<Definition> lock(String id) {
        return jdbc.queryForList("SELECT manifest::text AS manifest,builtin FROM eap.expert_definition WHERE id=? FOR UPDATE", id)
                .stream().findFirst().map(JdbcExpertDefinitionStore::read);
    }

    @Override
    public boolean isBuiltin(String id) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT COALESCE((SELECT builtin FROM eap.expert_definition WHERE id=?),false)", Boolean.class, id));
    }

    @Override
    public List<UUID> knowledgeGrants(String id) {
        return jdbc.query("SELECT knowledge_base_id FROM eap.expert_knowledge_grant WHERE expert_id=?",
                (rs, row) -> rs.getObject(1, UUID.class), id);
    }

    @Override
    public boolean databaseGranted(String expertId, UUID databaseId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM eap.expert_database_grant WHERE expert_id=? AND database_profile_id=?)",
                Boolean.class, expertId, databaseId));
    }

    @Override
    public boolean referenceExists(String table, UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM " + table + " WHERE id=?)", Boolean.class, id));
    }

    @Override
    public void replaceGrants(String id, List<UUID> knowledgeBases, List<UUID> databaseProfiles, List<String> capabilities) {
        jdbc.update("DELETE FROM eap.expert_knowledge_grant WHERE expert_id=?", id);
        jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?", id);
        jdbc.update("DELETE FROM eap.expert_mcp_grant WHERE expert_id=?", id);
        for (var key : knowledgeBases) jdbc.update("INSERT INTO eap.expert_knowledge_grant VALUES (?,?) ON CONFLICT DO NOTHING", id, key);
        for (var key : databaseProfiles) jdbc.update("INSERT INTO eap.expert_database_grant VALUES (?,?) ON CONFLICT DO NOTHING", id, key);
        for (var capability : capabilities) jdbc.update("INSERT INTO eap.expert_mcp_grant(expert_id,capability) VALUES (?,?) ON CONFLICT DO NOTHING", id, capability);
    }

    @Override
    public void setEnabled(String id, boolean enabled) {
        jdbc.update("UPDATE eap.expert_definition SET enabled=?,revision=revision+1,updated_at=now() WHERE id=?", enabled, id);
    }
}
