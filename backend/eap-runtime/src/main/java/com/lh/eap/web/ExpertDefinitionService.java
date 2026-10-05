package com.lh.eap.web;

import java.nio.charset.StandardCharsets;
import java.io.IOException;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ExpertDefinitionService {
    private final JdbcTemplate jdbc;
    public ExpertDefinitionService(JdbcTemplate jdbc) {this.jdbc = jdbc;}
    public String builtin() {
        try (var stream = new ClassPathResource("experts/sql-expert.json").getInputStream()) {
            return new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException error) {throw new IllegalStateException("内置专家定义无法读取", error);}
    }
    public ExpertManifest require(String id, boolean active) {
        if ("sql-expert".equals(id)) return ExpertManifest.parse(builtin());
        var records = jdbc.queryForList("SELECT manifest::text AS manifest,enabled FROM eap.expert_definition WHERE id=?", id);
        if (records.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "专家不存在");
        if (active && !Boolean.TRUE.equals(records.getFirst().get("enabled"))) throw new ResponseStatusException(HttpStatus.CONFLICT, "专家仍为草稿，请先启用并授权");
        return ExpertManifest.parse((String) records.getFirst().get("manifest"));
    }
    public List<UUID> knowledgeGrants(String id) {
        if ("sql-expert".equals(id)) return List.of();
        return jdbc.query("SELECT knowledge_base_id FROM eap.expert_knowledge_grant WHERE expert_id=?", (rs,row)->rs.getObject(1, UUID.class), id);
    }
    public boolean databaseGranted(String id, UUID profile) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM eap.expert_database_grant WHERE expert_id=? AND database_profile_id=?)", Boolean.class, id, profile));
    }
    public List<String> validateReferences(ExpertManifest manifest) {
        var errors = new ArrayList<String>();
        checkReferences(manifest.knowledgeBases(), "eap.knowledge_base", "知识库", errors);
        checkReferences(manifest.databaseProfiles(), "eap.database_profile", "数据库资料", errors);
        return errors;
    }
    private void checkReferences(List<String> ids, String table, String label, List<String> errors) {
        if (ids == null) return;
        if(ids.size()>100){errors.add(label+"引用最多100项");return;}
        for (var id : ids) {
            try {
                var exists = jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM "+table+" WHERE id=?)", Boolean.class, UUID.fromString(id));
                if (!Boolean.TRUE.equals(exists)) errors.add(label+"不存在："+id);
            } catch (IllegalArgumentException error) {errors.add(label+"必须使用目录中的 UUID 标识："+id);}
        }
    }
    @Transactional
    public void activate(String id, boolean enabled) {
        if ("sql-expert".equals(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "请复制内置专家为自定义专家后授权");
        var rows=jdbc.queryForList("SELECT manifest::text AS manifest FROM eap.expert_definition WHERE id=? FOR UPDATE", id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"专家不存在");
        var manifest=ExpertManifest.parse((String)rows.getFirst().get("manifest"));
        if (enabled) {
            var errors=new ArrayList<>(ExpertGraph.validate(manifest));errors.addAll(validateReferences(manifest));
            if(!errors.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,String.join("；",errors));
        }
        jdbc.update("DELETE FROM eap.expert_knowledge_grant WHERE expert_id=?",id);
        jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?",id);
        if(enabled) {
            for(var key:manifest.knowledgeBases()==null?List.<String>of():manifest.knowledgeBases()) jdbc.update("INSERT INTO eap.expert_knowledge_grant VALUES (?,?) ON CONFLICT DO NOTHING",id,UUID.fromString(key));
            for(var key:manifest.databaseProfiles()==null?List.<String>of():manifest.databaseProfiles()) jdbc.update("INSERT INTO eap.expert_database_grant VALUES (?,?) ON CONFLICT DO NOTHING",id,UUID.fromString(key));
        }
        jdbc.update("UPDATE eap.expert_definition SET enabled=?,revision=revision+1,updated_at=now() WHERE id=?",enabled,id);
    }
}
