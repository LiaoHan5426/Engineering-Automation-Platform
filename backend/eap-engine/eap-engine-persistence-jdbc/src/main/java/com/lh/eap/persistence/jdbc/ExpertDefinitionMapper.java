package com.lh.eap.persistence.jdbc;
import com.lh.eap.core.ExpertDefinitionManagementStore;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ExpertDefinitionMapper implements ExpertDefinitionManagementStore {
    private final JdbcTemplate jdbc;
    public ExpertDefinitionMapper(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    /** Shares activation's row lock; call inside the context resolver's short transaction. */
    public Optional<Map<String,Object>> lockForKnowledge(String id) {
        return jdbc.queryForList("SELECT id,manifest::text AS manifest,enabled,revision FROM eap.expert_definition WHERE id=? FOR SHARE", id).stream().findFirst();
    }
    @Override public Optional<LockedDefinition> lockDefinition(String id) {
        return lockForKnowledge(id).map(row -> new LockedDefinition((String) row.get("id"),
                (String) row.get("manifest"), Boolean.TRUE.equals(row.get("enabled")),
                ((Number) row.get("revision")).longValue()));
    }
    public List<Map<String,Object>> list() { return jdbc.queryForList("SELECT id,manifest::text AS manifest,enabled,revision,builtin FROM eap.expert_definition ORDER BY builtin DESC, updated_at DESC"); }
    @Override public List<ListedDefinition> listDefinitions() {
        return list().stream().map(row -> new ListedDefinition((String) row.get("id"),
                (String) row.get("manifest"), Boolean.TRUE.equals(row.get("enabled")),
                ((Number) row.get("revision")).longValue(), Boolean.TRUE.equals(row.get("builtin")))).toList();
    }
    /** Save the complete explicit definition and revoke grants in the management transaction. */
    @Override public String saveDraft(String id, String name, String manifest) {
        var saved = jdbc.queryForObject("""
                INSERT INTO eap.expert_definition(id,name,manifest) VALUES (?,?,?::jsonb)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name,
                manifest=excluded.manifest,
                enabled=false,revision=expert_definition.revision+1,updated_at=now()
                WHERE NOT expert_definition.builtin
                RETURNING manifest::text
                """, String.class, id, name, manifest);
        jdbc.update("DELETE FROM eap.expert_knowledge_grant WHERE expert_id=?",id);
        jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?",id);
        jdbc.update("DELETE FROM eap.expert_mcp_grant WHERE expert_id=?",id);
        return saved;
    }
}
