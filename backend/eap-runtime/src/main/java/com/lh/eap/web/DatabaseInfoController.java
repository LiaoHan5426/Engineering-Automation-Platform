package com.lh.eap.web;

import org.springframework.web.bind.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;

@RestController
@RequestMapping("/api/databases")
public class DatabaseInfoController {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    public DatabaseInfoController(JdbcTemplate jdbc){this.jdbc=jdbc;}
    @GetMapping
    public Map<String,Object> list(){
        return Map.of("items",jdbc.query("SELECT id,label,engine,environment FROM eap.database_profile ORDER BY updated_at DESC",
                (rs,row)->Map.of("id",rs.getObject("id"),"label",rs.getString("label"),"engine",rs.getString("engine"),"environment",rs.getString("environment"),"credentialsExposed",false)),
                "policy","仅保存脱敏表结构和索引资料，不接受凭据或连接字符串；不自动连接业务数据库");
    }
    @GetMapping("/{id}")
    public Map<String,Object> detail(@PathVariable UUID id){
        var rows=jdbc.queryForList("SELECT id,label,engine,environment,metadata::text AS metadata FROM eap.database_profile WHERE id=?",id);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据库资料不存在");
        var result=new LinkedHashMap<>(rows.getFirst());result.put("metadata",JSON.readValue((String)result.get("metadata"),Map.class));return result;
    }
    @PostMapping
    public Map<String,Object> create(@RequestBody Profile request){return save(UUID.randomUUID(),request,false);}
    @PutMapping("/{id}")
    public Map<String,Object> update(@PathVariable UUID id,@RequestBody Profile request){return save(id,request,true);}
    /**
     * Refuses to delete a profile that an enabled expert still depends on, so a live expert cannot be
     * left pointing at a snapshot that no longer exists. Draft references do not block deletion: they
     * grant nothing, and enabling such a draft is rejected by manifest validation anyway.
     */
    @DeleteMapping("/{id}")
    @Transactional
    public Map<String,Object> remove(@PathVariable UUID id){
        var referenced=jdbc.queryForList("""
                SELECT id FROM eap.expert_definition
                WHERE enabled AND manifest->'databaseProfiles' @> to_jsonb(?::text)
                """,id.toString());
        if(!referenced.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"数据库资料正被已启用的专家引用："+referenced);
        if(jdbc.update("DELETE FROM eap.database_profile WHERE id=?",id)==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据库资料不存在");
        return Map.of("id",id,"status","deleted");
    }
    private Map<String,Object> save(UUID id,Profile request,boolean update){
        if(SensitiveData.containsSecret(request.label())||SensitiveData.containsSecret(request.engine())||SensitiveData.containsSecret(request.environment()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"资料字段包含凭据，请脱敏后保存");
        if(request.label()==null||request.label().isBlank()||request.label().length()>200||request.engine()==null||request.environment()==null||request.engine().length()>40||request.environment().length()>40)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请填写有效名称、引擎和环境");
        var metadata=request.metadata()==null?Map.of():request.metadata();
        if(SensitiveData.containsSecret(metadata))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"资料含凭据或连接字符串，禁止保存");
        var json=JSON.writeValueAsString(metadata);
        if(json.length()>100000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"资料最多10万字符");
        if(update){
            if(jdbc.update("UPDATE eap.database_profile SET label=?,engine=?,environment=?,metadata=?::jsonb,updated_at=now() WHERE id=?",request.label(),request.engine(),request.environment(),json,id)==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据库资料不存在");
        }else jdbc.update("INSERT INTO eap.database_profile(id,label,engine,environment,metadata) VALUES (?,?,?,?,?::jsonb)",id,request.label(),request.engine(),request.environment(),json);
        return Map.of("id",id,"status","saved");
    }
    public record Profile(String label,String engine,String environment,Map<String,Object> metadata){}
}
