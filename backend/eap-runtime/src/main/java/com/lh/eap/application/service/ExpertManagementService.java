package com.lh.eap.application.service;

import com.lh.eap.web.dto.*;
import org.springframework.stereotype.Service;

import com.lh.eap.application.service.CapabilityCatalog;
import com.lh.eap.application.service.ExpertDefinitionService;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.domain.expert.ExpertGraph;
import com.lh.eap.common.SensitiveData;

import com.lh.eap.rules.RulePackService;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import com.lh.eap.persistence.mapper.ExpertDefinitionMapper;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@Service

public class ExpertManagementService {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final ExpertDefinitionMapper mapper;
    private final ExpertDefinitionService definitions;
    private final RulePackService rulePacks;
    private final CapabilityCatalog capabilities;
    public ExpertManagementService(ExpertDefinitionMapper mapper, ExpertDefinitionService definitions, RulePackService rulePacks, CapabilityCatalog capabilities) {
        this.mapper=mapper;this.definitions=definitions;this.rulePacks=rulePacks;this.capabilities=capabilities;
    }

    /** Every expert — shipped or authored — comes from the same table. */

    public Map<String,Object> list() {
        var items=new ArrayList<String>();
        var states=new LinkedHashMap<String,Object>();
        for(var row:mapper.list()){
            items.add((String)row.get("manifest"));
            states.put((String)row.get("id"),Map.of(
                    "enabled",Boolean.TRUE.equals(row.get("enabled")),
                    "builtin",Boolean.TRUE.equals(row.get("builtin")),
                    "revision",row.get("revision")));
        }
        return Map.of("items",items,"states",states);
    }

    /**
     * Vocabulary the editor writes against: capabilities (with their kind, scope and facts), platform
     * rules, rule packs (with the capabilities each one needs) and the fact vocabulary.
     *
     * <p>{@code capabilities} lists what may be used as an ordinary node — platform capabilities only.
     * Expert-scoped capabilities (MCP tools) are reported under {@code expertScopedVocabulary}: they are
     * never enabled globally, so an editor must not offer them as just another node.
     */

    public Map<String,Object> catalog(){
        var result=new LinkedHashMap<String,Object>();
        var catalog=capabilities.catalog();
        result.put("capabilities",catalog.get("globallyUsable"));
        result.put("capabilityItems",catalog.get("items"));
        result.put("capabilityKinds",catalog.get("kinds"));
        result.put("platformScoped",catalog.get("platformScoped"));
        result.put("expertScoped",catalog.get("expertScoped"));
        result.put("disabledPlatform",catalog.get("disabledPlatform"));
        result.put("expertScopedVocabulary",catalog.get("expertScopedVocabulary"));
        result.put("mcpServers",catalog.get("mcpServers"));
        result.put("scopeNotes",catalog.get("scopeNotes"));
        result.put("rules",ExpertGraph.RULES.stream().sorted().toList());
        result.put("rulePacks",rulePacks.catalog());
        result.put("facts",com.lh.eap.rules.SqlFactVocabulary.FACTS);
        return result;
    }

    public Map<String,Object> validate(ExpertDefinitionRequest request) {
        var errors=new ArrayList<String>();
        if(request.id()==null||!request.id().matches("[a-z0-9]+(?:-[a-z0-9]+)*")||request.id().length()>100) errors.add("标识必须为小写英文数字和连字符，最多100字符");
        if(request.name()==null||request.name().isBlank()||request.name().length()>200) errors.add("名称不能为空，最多200字符");
        if(request.manifest()==null||request.manifest().length()>100000) errors.add("定义不能为空，最多10万字符");
        if(errors.isEmpty()){
            try{
                if(SensitiveData.containsSecret(JSON.readValue(request.manifest(),Map.class)))errors.add("专家定义含凭据或连接字符串，请脱敏后保存");
                var manifest=ExpertManifest.parse(request.manifest());
                if(!request.id().equals(manifest.id())||!request.name().equals(manifest.name())) errors.add("Manifest 标识和名称必须与专家信息一致");
                errors.addAll(definitions.validateGraph(manifest));
                errors.addAll(definitions.validateReferences(manifest));
            }catch(RuntimeException error){errors.add("定义 JSON 无效或字段类型不正确");}
        }
        return Map.of("valid",errors.isEmpty(),"errors",errors);
    }

    @Transactional
    public Map<String,Object> save(ExpertDefinitionRequest request){
        var validation=validate(request);
        if(!Boolean.TRUE.equals(validation.get("valid"))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,validation.get("errors").toString());
        if(definitions.isBuiltin(request.id())) throw new ResponseStatusException(HttpStatus.CONFLICT,"内置专家不可就地覆盖，请复制为新标识后编辑");
        mapper.saveDraft(request.id(),request.name(),request.manifest());
        return Map.of("id",request.id(),"status","saved-draft","enabled",false);
    }

    public Map<String,Object> activate(String id,ExpertActivationRequest request){
        definitions.activate(id,request.enabled());return Map.of("id",id,"enabled",request.enabled());
    }
}
