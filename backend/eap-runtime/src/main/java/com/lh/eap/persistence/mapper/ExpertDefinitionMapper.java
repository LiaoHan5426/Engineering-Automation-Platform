package com.lh.eap.persistence.mapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ExpertDefinitionMapper {
    private final JdbcTemplate jdbc;
    public ExpertDefinitionMapper(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public List<Map<String,Object>> list() { return jdbc.queryForList("SELECT id,manifest::text AS manifest,enabled,revision,builtin FROM eap.expert_definition ORDER BY builtin DESC, updated_at DESC"); }
    public void saveDraft(String id,String name,String manifest) {
        jdbc.update("INSERT INTO eap.expert_definition(id,name,manifest) VALUES (?,?,?::jsonb) ON CONFLICT(id) DO UPDATE SET name=excluded.name,manifest=excluded.manifest,enabled=false,revision=expert_definition.revision+1,updated_at=now()",id,name,manifest);
        jdbc.update("DELETE FROM eap.expert_knowledge_grant WHERE expert_id=?",id);
        jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?",id);
        jdbc.update("DELETE FROM eap.expert_mcp_grant WHERE expert_id=?",id);
    }
}
