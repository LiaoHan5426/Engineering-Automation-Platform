package com.lh.eap.persistence.mapper;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DatabaseProfileMapper {
    private final JdbcTemplate jdbc;
    public DatabaseProfileMapper(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public List<Map<String,Object>> list() {
        return jdbc.query("SELECT id,label,engine,environment FROM eap.database_profile ORDER BY updated_at DESC",
                (rs,row) -> Map.of("id",rs.getObject("id"),"label",rs.getString("label"),"engine",rs.getString("engine"),"environment",rs.getString("environment"),"credentialsExposed",false));
    }
    public List<Map<String,Object>> detail(UUID id) { return jdbc.queryForList("SELECT id,label,engine,environment,metadata::text AS metadata FROM eap.database_profile WHERE id=?",id); }
    public List<Map<String,Object>> enabledReferences(UUID id) { return jdbc.queryForList("SELECT id FROM eap.expert_definition WHERE enabled AND manifest->'databaseProfiles' @> to_jsonb(?::text)",id.toString()); }
    public int delete(UUID id) { return jdbc.update("DELETE FROM eap.database_profile WHERE id=?",id); }
    public int update(UUID id,String label,String engine,String environment,String json) { return jdbc.update("UPDATE eap.database_profile SET label=?,engine=?,environment=?,metadata=?::jsonb,updated_at=now() WHERE id=?",label,engine,environment,json,id); }
    public void insert(UUID id,String label,String engine,String environment,String json) { jdbc.update("INSERT INTO eap.database_profile(id,label,engine,environment,metadata) VALUES (?,?,?,?,?::jsonb)",id,label,engine,environment,json); }
}
