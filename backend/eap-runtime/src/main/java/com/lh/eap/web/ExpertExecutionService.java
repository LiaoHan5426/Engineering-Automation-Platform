package com.lh.eap.web;

import com.lh.eap.api.Observation;
import com.lh.eap.llm.PromptPreprocessor;
import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePackService;
import java.nio.file.Path;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Runs an expert's capability graph.
 *
 * <p>The executor is a scheduler and nothing else. It resolves the expert's declared rule packs, walks
 * the graph in dependency order, and delegates every node to a registered {@link CapabilityHandler}.
 * It contains no per-capability logic, so adding a capability never touches this class.
 *
 * <p>Judgement is a stage of its own and runs <em>after</em> the graph: each capability publishes the
 * facts it can prove, and the rule packs are then evaluated once over the accumulated fact base. That
 * ordering is what lets a single rule combine statement shape with snapshot and plan evidence, and it
 * is why a rule whose facts could not be produced is reported as blocked instead of as "no findings".
 *
 * <p>It is also the only place that knows the boundary of "one execution". Expert-scoped capabilities
 * (MCP tools, remote endpoints) are resolved through {@link CapabilityHandlerRegistry#resolveFor}, so an
 * expert that did not declare one cannot run it even though the handler is registered, and the run opens
 * and closes its own MCP session scope so no external session outlives the grants that allowed it.
 */
@Service
public class ExpertExecutionService {
    private static final JsonMapper JSON=JsonMapper.builder().build();
    private static final Logger log=LoggerFactory.getLogger(ExpertExecutionService.class);
    private final ExpertDefinitionService definitions;
    private final TaskRepository tasks;
    private final CapabilityHandlerRegistry handlers;
    private final RulePackService rulePacks;
    private final Path workspace;
    private final SqlExpertService model;
    private final McpSessionRegistry mcpSessions;

    public ExpertExecutionService(ExpertDefinitionService definitions,TaskRepository tasks,
            CapabilityHandlerRegistry handlers,RulePackService rulePacks,Path workspace,SqlExpertService model,
            McpSessionRegistry mcpSessions){
        this.definitions=definitions;this.tasks=tasks;this.handlers=handlers;this.rulePacks=rulePacks;
        this.workspace=workspace;this.model=model;this.mcpSessions=mcpSessions;
    }

    public record Request(String sql,String question,UUID databaseId,Map<String,Object> explainPlan,Boolean enhanceWithModel,String pattern){}

    @Transactional(isolation=Isolation.REPEATABLE_READ,timeout=90)
    public Map<String,Object> execute(String expertId,Request request){
        var manifest=definitions.require(expertId,true);
        var known=new LinkedHashSet<>(handlers.names());
        known.addAll(manifest.expertScopedCapabilities());
        var errors=ExpertGraph.validate(manifest,known,Map.of(),handlers.expertScopedNames(),switchedOff(manifest));
        if(!errors.isEmpty())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,String.join("；",errors));
        var sql=SensitiveData.redact(request.sql()).trim();
        var question=SensitiveData.redact(request.question()).trim();
        if(sql.length()>50000||question.length()>8000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"SQL 最多5万字符，问题最多8000字符");
        if(sql.isBlank()&&question.isBlank()&&(request.pattern()==null||request.pattern().isBlank()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请填写问题、SQL 或检索目标");
        if(request.explainPlan()!=null&&(JSON.writeValueAsString(request.explainPlan()).length()>100000||SensitiveData.containsSecret(request.explainPlan())))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"执行计划过大或包含凭据");

        var declaredPackIds=manifest.rulePacks()==null?List.<String>of():manifest.rulePacks();
        var resolvedPacks=rulePacks.resolve(declaredPackIds);
        var missingPacks=rulePacks.unresolved(declaredPackIds);

        var id=UUID.randomUUID();
        var goal=!question.isBlank()?question:!sql.isBlank()?sql:SensitiveData.redact(request.pattern());
        // Everything expert-scoped is bound to this one execution and released with it.
        mcpSessions.beginExecution(id,expertId);
        try{
            return executeGraph(new Run(id,expertId,manifest,request,sql,question,goal,declaredPackIds,resolvedPacks,missingPacks));
        }finally{
            var closed=mcpSessions.endExecution(id);
            log.info("Expert execution {} closed: mcpSessions={}",id,closed);
        }
    }

    private record Run(UUID id,String expertId,ExpertManifest manifest,Request request,String sql,
            String question,String goal,List<String> declaredPackIds,List<RulePack> resolvedPacks,
            List<String> missingPacks){}

    private Map<String,Object> executeGraph(Run ctx){
        var id=ctx.id();var expertId=ctx.expertId();var manifest=ctx.manifest();var request=ctx.request();
        var sql=ctx.sql();var question=ctx.question();var goal=ctx.goal();
        var declaredPackIds=ctx.declaredPackIds();var resolvedPacks=ctx.resolvedPacks();var missingPacks=ctx.missingPacks();
        var observations=new ArrayList<Observation>();
        var outcomes=new LinkedHashMap<String,Map<String,Object>>();
        var blocking=new HashSet<String>();
        var advice=new ArrayList<String>();
        var evidence=new ArrayList<Map<String,Object>>();
        var analysis=new LinkedHashMap<String,Object>();
        var facts=new LinkedHashMap<String,Object>();
        var executed=new LinkedHashSet<String>();
        analysis.put("facts",facts);
        boolean incomplete=false,failed=false;
        if(!missingPacks.isEmpty()){
            incomplete=true;
            advice.add("专家声明的规则包无法解析，已跳过："+String.join("、",missingPacks));
            log.warn("Expert execution for {} references unresolved rule packs: {}",expertId,missingPacks);
        }
        long deadline=System.nanoTime()+45_000_000_000L;
        var grants=definitions.knowledgeGrants(expertId).stream().filter(key->manifest.knowledgeBases()!=null&&manifest.knowledgeBases().contains(key.toString())).toList();
        log.info("Expert execution {} started: expert={}, nodes={}, rulePacks={}",id,expertId,manifest.steps().size(),declaredPackIds);
        for(var step:ExpertGraph.order(manifest)){
            var blocked=manifest.edges().stream().anyMatch(edge->edge.target().equals(step.id())&&blocking.contains(edge.source()));
            NodeResult result;
            if(blocked||System.nanoTime()>deadline) {
                result=new NodeResult(false,false,blocked?"必需依赖未通过，未执行此节点":"流程达到45秒调度预算，未执行此节点",Map.of());
                blocking.add(step.id());failed=true;
            }else {
                try{
                    result=run(step,request,sql,question,expertId,id,manifest,grants,facts,analysis,advice,evidence,resolvedPacks);
                    executed.add(step.capability());
                }
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

        // Judgement stage: one evaluation over every fact the graph managed to produce.
        var judgement=DeterministicSqlAnalyzer.judge(analysis,resolvedPacks,executed);
        analysis.putAll(judgement);
        if(judgement.get("suggestions") instanceof List<?> suggestions) for(var item:suggestions) advice.add(String.valueOf(item));
        if(judgement.get("blockedRules") instanceof List<?> blockedRules&&!blockedRules.isEmpty()){
            incomplete=true;
            for(var entry:blockedRules){
                @SuppressWarnings("unchecked") var rule=(Map<String,Object>)entry;
                advice.add("规则 "+rule.get("rule")+" 未能判定：它依赖的能力 "+rule.get("missingCapabilities")
                        +" 本次没有执行，因此它的证据缺失，不能当作“未发现问题”。");
            }
            log.warn("Expert execution {} has {} unjudged rules",id,blockedRules.size());
        }

        SqlExpertService.Outcome modelOutcome=null;
        if(!failed&&"valid".equals(analysis.get("parseStatus"))){
            var prepared=new PromptPreprocessor.SqlEvidence(sql,question,analysis,evidence,
                    List.copyOf(advice),
                    List.of("不得泄露凭据；不得自动执行 SQL；候选改写必须保持原查询语义，模型建议未通过语义或性能验证"));
            modelOutcome=model.advise(prepared,Boolean.TRUE.equals(request.enhanceWithModel()));
        }
        String modelAdvice=modelOutcome!=null&&modelOutcome.succeeded()?SensitiveData.redact(modelOutcome.text()):null;
        if(modelAdvice!=null)incomplete=true;
        var status=failed?"failed":incomplete?"partial":"completed";
        var decision=failed?"rejected":incomplete?"needs-review":"accepted";
        tasks.save(id,goal,status,decision,observations);
        var response=new LinkedHashMap<String,Object>();
        response.put("id",id);response.put("expertId",expertId);response.put("goal",goal);
        response.put("status",status);response.put("decision",decision);response.put("sql",sql);response.put("advice",advice);
        response.put("rulePacks",packSummary(resolvedPacks));
        response.put("rulePackRequirements",judgement.get("ruleCapabilities"));
        response.put("executedCapabilities",List.copyOf(executed));
        response.put("deterministicAnalysis",analysis);response.put("knowledgeEvidence",evidence);response.put("observations",observations);
        response.put("nodes",new ArrayList<>(outcomes.values()));response.put("expertAdvice",modelAdvice);
        response.put("modelAdvisor",SqlExpertService.toResponse(modelOutcome));
        response.put("analysisMode",modelAdvice==null?"deterministic-workflow":"deterministic-with-unverified-model-observation");
        response.put("modelEnhancement",modelOutcome==null?"unavailable":modelAdvice!=null?"unverified-observation":modelOutcome.attempted()?"unavailable":"skipped");
        response.put("safety",List.of("输入与持久化证据在平台侧脱敏","只读取已显式授权的资料与知识库","未连接业务数据库，未执行输入 SQL","仅当确定性证据不足或操作者显式请求时才调用模型，且提交前已做证据压缩","模型输出仅为待验证观察，不代表性能提升"));
        response.put("message",failed?"必需节点未通过，已停止其后续依赖":incomplete?"已返回可用分析；缺少上下文或独立验证的节点已明确标注":"流程已完成；完成状态不等于证明 SQL 性能提升");
        log.info("Expert execution {} completed: status={}, observations={}",id,status,observations.size());
        return response;
    }

    /**
     * Capabilities this manifest wants that the operator has switched off.
     *
     * <p>Normally impossible: switching off a capability an enabled expert runs is already refused, so
     * this only fires if the state changed behind the platform's back (a direct row edit, a restored
     * backup). It is checked anyway because the alternative is a run that reports a failing node with no
     * explanation, and because the cost is one pass over the manifest.
     */
    private Set<String> switchedOff(ExpertManifest manifest){
        var result=new LinkedHashSet<String>();
        if(manifest.steps()!=null) for(var step:manifest.steps()){
            if(step!=null&&step.capability()!=null&&handlers.disabled(step.capability())) result.add(step.capability());
        }
        for(var tool:manifest.expertScopedCapabilities()) if(handlers.disabled(tool)) result.add(tool);
        return result;
    }

    private NodeResult run(ExpertManifest.Step step,Request request,String sql,String question,String expertId,
            UUID executionId,ExpertManifest manifest,List<UUID> grants,Map<String,Object> facts,
            Map<String,Object> analysis,List<String> advice,List<Map<String,Object>> evidence,List<RulePack> packs){
        var handler=handlers.resolveFor(manifest,step.capability());
        if(handler.isEmpty()){
            // Three different refusals, three different fixes: a switch to flip, a declaration to add, or
            // a capability that does not exist. Saying "not supported" for all of them wastes the reader's
            // time looking for the wrong problem.
            if(handlers.disabled(step.capability())){
                return new NodeResult(false,false,"能力 "+step.capability()
                        +" 已在平台停用，本节点不会执行。请在能力目录中重新启用该能力。",Map.of());
            }
            var registered=handlers.find(step.capability()).isPresent();
            return new NodeResult(false,false,registered
                    ?"能力 "+step.capability()+" 是专家级能力（MCP/远端工具），本专家清单未声明授权，因此不会执行；"
                        +"MCP 工具不会在运行时全局启用，请在清单的 mcpTools 中声明后重新启用专家"
                    :"运行时不支持此能力",Map.of());
        }
        return handler.get().handle(new CapabilityContext(step,request,sql,question,expertId,executionId,grants,
                facts,analysis,advice,evidence,packs,workspace));
    }

    private static List<Map<String,Object>> packSummary(List<RulePack> packs){
        var summary=new ArrayList<Map<String,Object>>();
        for(var pack:packs)summary.add(Map.of("id",pack.id(),"name",Objects.toString(pack.name(),pack.id()),
                "ruleCount",pack.rules()==null?0:pack.rules().size(),
                "requires",List.copyOf(com.lh.eap.rules.RulePacks.requiredCapabilities(pack))));
        return summary;
    }
}
