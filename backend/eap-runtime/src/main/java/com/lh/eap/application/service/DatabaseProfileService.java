package com.lh.eap.application.service;

import com.lh.eap.web.dto.*;
import org.springframework.stereotype.Service;

import com.lh.eap.common.SensitiveData;

import com.lh.eap.persistence.mapper.DatabaseProfileMapper;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;

@Service

public class DatabaseProfileService {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final DatabaseProfileMapper mapper;
    public DatabaseProfileService(DatabaseProfileMapper mapper){this.mapper=mapper;}

    public Map<String,Object> list(){
        return Map.of("items",mapper.list(),
                "policy","仅保存脱敏表结构和索引资料，不接受凭据或连接字符串；不自动连接业务数据库");
    }

    public Map<String,Object> detail(UUID id){
        var rows=mapper.detail(id);
        if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据库资料不存在");
        var result=new LinkedHashMap<>(rows.getFirst());result.put("metadata",JSON.readValue((String)result.get("metadata"),Map.class));return result;
    }

    public Map<String,Object> create(DatabaseProfileRequest request){return save(UUID.randomUUID(),request,false);}

    public Map<String,Object> update(UUID id,DatabaseProfileRequest request){return save(id,request,true);}
    /**
     * Refuses to delete a profile that an enabled expert still depends on, so a live expert cannot be
     * left pointing at a snapshot that no longer exists. Draft references do not block deletion: they
     * grant nothing, and enabling such a draft is rejected by manifest validation anyway.
     */

    @Transactional
    public Map<String,Object> remove(UUID id){
        var referenced=mapper.enabledReferences(id);
        if(!referenced.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"数据库资料正被已启用的专家引用："+referenced);
        if(mapper.delete(id)==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据库资料不存在");
        return Map.of("id",id,"status","deleted");
    }
    private Map<String,Object> save(UUID id,DatabaseProfileRequest request,boolean update){
        if(SensitiveData.containsSecret(request.label())||SensitiveData.containsSecret(request.engine())||SensitiveData.containsSecret(request.environment()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"资料字段包含凭据，请脱敏后保存");
        if(request.label()==null||request.label().isBlank()||request.label().length()>200||request.engine()==null||request.environment()==null||request.engine().length()>40||request.environment().length()>40)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请填写有效名称、引擎和环境");
        var metadata=request.metadata()==null?Map.of():request.metadata();
        if(SensitiveData.containsSecret(metadata))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"资料含凭据或连接字符串，禁止保存");
        var json=JSON.writeValueAsString(metadata);
        if(json.length()>100000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"资料最多10万字符");
        if(update){
            if(mapper.update(id,request.label(),request.engine(),request.environment(),json)==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"数据库资料不存在");
        }else mapper.insert(id,request.label(),request.engine(),request.environment(),json);
        return Map.of("id",id,"status","saved");
    }
}
