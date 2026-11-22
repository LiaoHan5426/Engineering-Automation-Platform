package com.lh.eap.persistence.mapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ExpertDefinitionMapper {
    private final JdbcTemplate jdbc;
    public ExpertDefinitionMapper(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    /** Shares activation's row lock; call inside the context resolver's short transaction. */
    public Optional<Map<String,Object>> lockForKnowledge(String id) {
        return jdbc.queryForList("SELECT id,manifest::text AS manifest,enabled,revision FROM eap.expert_definition WHERE id=? FOR SHARE", id).stream().findFirst();
    }
    public List<Map<String,Object>> list() { return jdbc.queryForList("SELECT id,manifest::text AS manifest,enabled,revision,builtin FROM eap.expert_definition ORDER BY builtin DESC, updated_at DESC"); }
    /** Save the complete explicit definition and revoke grants in the management transaction. */
    public String saveDraft(String id, String name, String manifest) {
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
