package com.lh.eap.web;

import com.lh.eap.rules.RulePackService;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/experts")
public class ExpertController {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final ExpertDefinitionService definitions;
    private final RulePackService rulePacks;
    private final CapabilityCatalog capabilities;
    public ExpertController(JdbcTemplate jdbc, ExpertDefinitionService definitions, RulePackService rulePacks, CapabilityCatalog capabilities) {
        this.jdbc=jdbc;this.definitions=definitions;this.rulePacks=rulePacks;this.capabilities=capabilities;
    }

    /** Every expert — shipped or authored — comes from the same table. */
    @GetMapping
    public Map<String,Object> list() {
        var items=new ArrayList<String>();
        var states=new LinkedHashMap<String,Object>();
        for(var row:jdbc.queryForList("SELECT id,manifest::text AS manifest,enabled,revision,builtin FROM eap.expert_definition ORDER BY builtin DESC, updated_at DESC")){
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
    @GetMapping("/catalog")
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

    @PostMapping("/validate")
    public Map<String,Object> validate(@RequestBody Definition request) {
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

    @PostMapping
    @Transactional
    public Map<String,Object> save(@RequestBody Definition request){
        var validation=validate(request);
        if(!Boolean.TRUE.equals(validation.get("valid"))) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,validation.get("errors").toString());
        if(definitions.isBuiltin(request.id())) throw new ResponseStatusException(HttpStatus.CONFLICT,"内置专家不可就地覆盖，请复制为新标识后编辑");
        jdbc.update("INSERT INTO eap.expert_definition(id,name,manifest) VALUES (?,?,?::jsonb) ON CONFLICT(id) DO UPDATE SET name=excluded.name,manifest=excluded.manifest,enabled=false,revision=expert_definition.revision+1,updated_at=now()",request.id(),request.name(),request.manifest());
        jdbc.update("DELETE FROM eap.expert_knowledge_grant WHERE expert_id=?",request.id());
        jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?",request.id());
        jdbc.update("DELETE FROM eap.expert_mcp_grant WHERE expert_id=?",request.id());
        return Map.of("id",request.id(),"status","saved-draft","enabled",false);
    }

    @PutMapping("/{id}/activation")
    public Map<String,Object> activate(@PathVariable String id,@RequestBody Activation request){
        definitions.activate(id,request.enabled());return Map.of("id",id,"enabled",request.enabled());
    }
    public record Definition(String id,String name,String manifest){}
    public record Activation(boolean enabled){}
}
