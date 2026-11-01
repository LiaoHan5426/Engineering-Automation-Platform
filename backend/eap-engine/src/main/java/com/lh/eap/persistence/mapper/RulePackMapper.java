package com.lh.eap.persistence.mapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RulePackMapper {
    private final JdbcTemplate jdbc;
    public RulePackMapper(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public void save(String id,String name,String manifest) { jdbc.update("INSERT INTO eap.rule_pack(id,name,manifest) VALUES (?,?,?::jsonb) ON CONFLICT(id) DO UPDATE SET name=excluded.name,manifest=excluded.manifest,enabled=true,revision=eap.rule_pack.revision+1,updated_at=now()",id,name,manifest); }
    public int update(String id,String name,String manifest) { return jdbc.update("UPDATE eap.rule_pack SET name=?,manifest=?::jsonb,revision=revision+1,updated_at=now() WHERE id=?",name,manifest,id); }
    public int activate(String id,boolean enabled) { return jdbc.update("UPDATE eap.rule_pack SET enabled=?,revision=revision+1,updated_at=now() WHERE id=?",enabled,id); }
    public List<Map<String,Object>> enabledReferences(String id) { return jdbc.queryForList("SELECT id FROM eap.expert_definition WHERE enabled AND manifest->'rulePacks' @> to_jsonb(?::text)",id); }
    public int delete(String id) { return jdbc.update("DELETE FROM eap.rule_pack WHERE id=?",id); }
    public Object revision(String id) { return jdbc.queryForObject("SELECT revision FROM eap.rule_pack WHERE id=?",Object.class,id); }
}
