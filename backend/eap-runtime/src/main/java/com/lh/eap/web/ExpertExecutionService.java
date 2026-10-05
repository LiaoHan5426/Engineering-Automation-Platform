package com.lh.eap.web;

import com.lh.eap.api.*;
import com.lh.eap.core.CapabilityRegistry;
import java.nio.file.Path;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@Service
public class ExpertExecutionService {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final Logger log=LoggerFactory.getLogger(ExpertExecutionService.class);
    private final ExpertDefinitionService definitions;
    private final KnowledgeRepository knowledge;
    private final TaskRepository tasks;
    private final JdbcTemplate jdbc;
    private final CapabilityRegistry registry;
    private final ProcessExecutor executor;
    private final Path workspace;
    private final SqlExpertService model;
    public ExpertExecutionService(ExpertDefinitionService definitions,KnowledgeRepository knowledge,TaskRepository tasks,
            JdbcTemplate jdbc,CapabilityRegistry registry,ProcessExecutor executor,Path workspace,SqlExpertService model){
        this.definitions=definitions;this.knowledge=knowledge;this.tasks=tasks;this.jdbc=jdbc;
        this.registry=registry;this.executor=executor;this.workspace=workspace;this.model=model;
    }
    public record Request(String sql,String question,UUID databaseId,Map<String,Object> explainPlan,Boolean enhanceWithModel,String pattern){}
    private record NodeResult(boolean success,boolean incomplete,String message,Map<String,Object> data){}
    @Transactional(isolation=Isolation.REPEATABLE_READ,timeout=90)
    public Map<String,Object> execute(String expertId,Request request){
        var manifest=definitions.require(expertId,true);
        var errors=ExpertGraph.validate(manifest);
        if(!errors.isEmpty())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,String.join("；",errors));
        var sql=SensitiveData.redact(request.sql()).trim();
        var question=SensitiveData.redact(request.question()).trim();
        if(sql.length()>50000||question.length()>8000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"SQL 最多5万字符，问题最多8000字符");
        if(sql.isBlank()&&question.isBlank()&&(request.pattern()==null||request.pattern().isBlank()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请填写问题、SQL 或检索目标");
        if(request.explainPlan()!=null&&(JSON.writeValueAsString(request.explainPlan()).length()>100000||SensitiveData.containsSecret(request.explainPlan())))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"执行计划过大或包含凭据");
        var id=UUID.randomUUID();
        var goal=!question.isBlank()?question:!sql.isBlank()?sql:SensitiveData.redact(request.pattern());
        var observations=new ArrayList<Observation>();
        var outcomes=new LinkedHashMap<String,Map<String,Object>>();
        var blocking=new HashSet<String>();
        var advice=new ArrayList<String>();
        var evidence=new ArrayList<Map<String,Object>>();
        var analysis=new LinkedHashMap<String,Object>();
        boolean incomplete=false,failed=false;
        long deadline=System.nanoTime()+45_000_000_000L;
        var grants=definitions.knowledgeGrants(expertId).stream().filter(key->manifest.knowledgeBases()!=null&&manifest.knowledgeBases().contains(key.toString())).toList();
        log.info("Expert execution {} started: expert={}, nodes={}",id,expertId,manifest.steps().size());
        for(var step:ExpertGraph.order(manifest)){
            var blocked=manifest.edges().stream().anyMatch(edge->edge.target().equals(step.id())&&blocking.contains(edge.source()));
            NodeResult result;
            if(blocked||System.nanoTime()>deadline) {
                result=new NodeResult(false,false,blocked?"必需依赖未通过，未执行此节点":"流程达到45秒调度预算，未执行此节点",Map.of());
                blocking.add(step.id());failed=true;
            }else {
                try{result=run(step,request,sql,question,expertId,grants,analysis,advice,evidence);}
                catch(RuntimeException error){log.warn("Expert execution {} node {} failed: {}",id,step.id(),error.getClass().getSimpleName());result=new NodeResult(false,false,"能力执行失败，请查看后端日志；敏感上下文不会写入日志",Map.of());}
            }
            if(!result.success()&&Boolean.TRUE.equals(step.required())){blocking.add(step.id());failed=true;}
            incomplete|=result.incomplete()||(!result.success()&&!Boolean.TRUE.equals(step.required()));
            var state=blocked?"blocked":result.incomplete()?"needs-context":result.success()?"succeeded":"failed";
            var metadata=Map.<String,Object>of("nodeId",step.id(),"state",state,"required",step.required(),"expertId",expertId);
            observations.add(new Observation(step.capability(),result.success(),result.success()?0:2,SensitiveData.redact(JSON.writeValueAsString(result.data())),result.success()?"":result.message(),metadata));
            outcomes.put(step.id(),Map.of("id",step.id(),"label",Objects.toString(step.label(),step.capability()),"capability",step.capability(),"state",state,"message",result.message(),"data",result.data()));
            log.info("Expert execution {} node {}: capability={}, state={}",id,step.id(),step.capability(),state);
        }
        String modelAdvice=null;
        if(Boolean.TRUE.equals(request.enhanceWithModel())&&!failed&&"valid".equals(analysis.get("parseStatus"))){
            modelAdvice=model.analyze(sql,List.of("不得泄露凭据；不得自动执行 SQL；模型建议未通过语义或性能验证",String.join("\n",advice))).map(SensitiveData::redact).orElse(null);
            if(modelAdvice!=null)incomplete=true;
        }
        var status=failed?"failed":incomplete?"partial":"completed";
        var decision=failed?"rejected":incomplete?"needs-review":"accepted";
        tasks.save(id,goal,status,decision,observations);
        var response=new LinkedHashMap<String,Object>();
        response.put("id",id);response.put("expertId",expertId);response.put("goal",goal);
        response.put("status",status);response.put("decision",decision);response.put("sql",sql);response.put("advice",advice);
        response.put("deterministicAnalysis",analysis);response.put("knowledgeEvidence",evidence);response.put("observations",observations);
        response.put("nodes",new ArrayList<>(outcomes.values()));response.put("expertAdvice",modelAdvice);
        response.put("analysisMode",modelAdvice==null?"deterministic-workflow":"deterministic-with-unverified-model-observation");
        response.put("modelEnhancement",!Boolean.TRUE.equals(request.enhanceWithModel())?"not-requested":modelAdvice==null?"unavailable":"unverified-observation");
        response.put("safety",List.of("输入与持久化证据在平台侧脱敏","只读取已显式授权的资料与知识库","未连接业务数据库，未执行输入 SQL","模型输出仅为待验证观察，不代表性能提升"));
        response.put("message",failed?"必需节点未通过，已停止其后续依赖":incomplete?"已返回可用分析；缺少上下文或独立验证的节点已明确标注":"流程已完成；完成状态不等于证明 SQL 性能提升");
        log.info("Expert execution {} completed: status={}, observations={}",id,status,observations.size());
        return response;
    }
    @SuppressWarnings("unchecked")
    private NodeResult run(ExpertManifest.Step step,Request request,String sql,String question,String expertId,List<UUID> grants,
            Map<String,Object> analysis,List<String> advice,List<Map<String,Object>> evidence){
        switch(step.capability()){
            case "sql.parse":
                if(sql.isBlank())return new NodeResult(true,true,"未提供 SQL，保留知识检索路径",Map.of());
                analysis.putAll(DeterministicSqlAnalyzer.analyze(sql));
                advice.addAll((List<String>)analysis.getOrDefault("suggestions",List.of()));
                return new NodeResult("valid".equals(analysis.get("parseStatus")),false,"平台使用 SQL AST 独立解析输入",new LinkedHashMap<>(analysis));
            case "knowledge.search":
                var query=question+" "+String.join(" ",(List<String>)analysis.getOrDefault("tables",List.of()));
                if(!((List<?>)analysis.getOrDefault("joinKeys",List.of())).isEmpty())query+=" join 关联 索引";
                var matches=knowledge.searchAuthorized(query,5,grants);
                evidence.addAll(matches);
                for(var match:matches)advice.add("知识依据："+match.get("knowledgeBase")+" / "+match.get("source")+"\n"+SensitiveData.redact((String)match.get("excerpt")));
                return new NodeResult(true,matches.isEmpty(),grants.isEmpty()?"此专家尚未获得知识库读取授权":matches.isEmpty()?"授权知识库中没有匹配内容":"已检索授权知识，引用内容仍需结合当前 SQL 验证",Map.of("matches",matches,"retrievalMode","local-keyword"));
            case "database.schema.read", "database.index.read":
                if(request.databaseId()==null)return new NodeResult(false,true,"未选择数据库资料",Map.of());
                if(!definitions.databaseGranted(expertId,request.databaseId()))return new NodeResult(false,true,"此专家无权读取所选数据库资料",Map.of());
                var rows=jdbc.queryForList("SELECT metadata::text AS metadata FROM eap.database_profile WHERE id=?",request.databaseId());
                if(rows.isEmpty())return new NodeResult(false,true,"数据库资料不存在",Map.of());
                var metadata=JSON.readValue((String)rows.getFirst().get("metadata"),Map.class);
                if(SensitiveData.containsSecret(metadata))return new NodeResult(false,false,"资料包含凭据，已阻止读取",Map.of());
                var key=step.capability().equals("database.schema.read")?"tables":"indexes";
                var value=metadata.get(key);
                if(value==null)return new NodeResult(false,true,"资料缺少 "+key+" 字段",Map.of());
                if(!(value instanceof List<?>))return new NodeResult(false,true,"资料字段 "+key+" 必须是列表",Map.of());
                advice.add("已读取所选资料的 "+key+"；这是人工登记快照，不代表当前数据库实时状态。");
                advice.addAll(key.equals("tables")?SqlMetadataInspector.inspectSchema(value,analysis):SqlMetadataInspector.inspectIndexes(value,analysis));
                return new NodeResult(true,false,"已读取显式授权的脱敏资料",Map.of(key,value));
            case "database.explain":
                if(request.explainPlan()==null)return new NodeResult(false,true,"未提供 EXPLAIN JSON；平台不会自动执行 SQL",Map.of());
                if(!hasPlanNode(request.explainPlan()))return new NodeResult(false,true,"计划没有有效的 Node Type，请提供 PostgreSQL EXPLAIN JSON",Map.of());
                planAdvice(request.explainPlan(),advice);
                return new NodeResult(true,false,"已分析用户提供的计划快照，不代表平台实测耗时",Map.of("plan",request.explainPlan()));
            case "git-status", "git-diff":
                var git=registry.require(step.capability()).execute(new ExecutionContext(workspace,executor));
                return new NodeResult(git.success(),false,"平台独立执行本地只读 Git 能力",Map.of("stdout",SensitiveData.redact(git.stdout()),"stderr",SensitiveData.redact(git.stderr()),"exitCode",git.exitCode()));
            case "rg-search":
                var pattern=SensitiveData.redact(request.pattern()).trim();
                if(pattern.isBlank()||pattern.length()>500)return new NodeResult(false,true,"请提供不超过500字符的检索目标",Map.of());
                var search=registry.require("rg-search").execute(new ExecutionContext(workspace,executor),pattern);
                return new NodeResult(search.exitCode()==0||search.exitCode()==1,false,"已执行本地检索，退出码1表示无匹配",Map.of("stdout",SensitiveData.redact(search.stdout()),"stderr",SensitiveData.redact(search.stderr()),"exitCode",search.exitCode()));
            default: return new NodeResult(false,false,"运行时不支持此能力",Map.of());
        }
    }
    private static void planAdvice(Object value,List<String> advice){
        if(value instanceof Map<?,?> map){
            if(map.containsKey("Node Type")){
                var node=String.valueOf(map.get("Node Type"));var relation=Objects.toString(map.get("Relation Name"),"未指定关系");
                advice.add("计划节点 "+node+"（"+relation+"），估计行数："+Objects.toString(map.get("Plan Rows"),"未提供")+"。这是计划证据，不是实际耗时。");
                if("Seq Scan".equals(node)&&map.get("Filter")!=null)advice.add("该顺序扫描包含过滤："+map.get("Filter")+"；需结合选择性、现有索引与实际行数比较是否适合索引访问。");
            }
            for(var child:map.values())planAdvice(child,advice);
        }else if(value instanceof Iterable<?> list)for(var child:list)planAdvice(child,advice);
    }
    private static boolean hasPlanNode(Object value){
        if(value instanceof Map<?,?> map){
            if(map.get("Node Type") instanceof String type&&!type.isBlank())return true;
            return map.values().stream().anyMatch(ExpertExecutionService::hasPlanNode);
        }
        if(value instanceof List<?> list)return list.stream().anyMatch(ExpertExecutionService::hasPlanNode);
        return false;
    }
}
