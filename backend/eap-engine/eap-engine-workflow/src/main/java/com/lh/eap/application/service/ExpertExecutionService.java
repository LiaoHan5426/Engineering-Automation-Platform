package com.lh.eap.application.service;

import com.lh.eap.persistence.mapper.TaskRepository;
import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.domain.model.NodeResult;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.core.ExpertAnalysisPolicy;
import com.lh.eap.core.ExpertAnalysisPolicyResolver;
import org.springframework.beans.factory.annotation.Autowired;
import com.lh.eap.core.ExecutionResource;
import com.lh.eap.core.ExecutionResourceScope;
import com.lh.eap.domain.expert.ExpertGraph;
import com.lh.eap.workflow.FixedWorkflowRunner;
import java.time.Duration;
import com.lh.eap.common.SensitiveData;

import com.lh.eap.api.Observation;
import com.lh.eap.rules.RulePack;
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
 * <p>This compatibility application service binds the v1 expert's authorization, analysis and stored
 * result to a fixed workflow. FixedWorkflowRunner owns graph scheduling; each node still resolves
 * through the existing {@link CapabilityHandler} registry and expert grants.
 *
 * <p>Judgment is a stage of its own and runs <em>after</em> the graph: each capability publishes the
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
    private final ExpertAnalysisPolicyResolver policies;
    private final Path workspace;
    private final List<ExecutionResource> resources;

    /** Explicit fixed-policy construction retained for embedded consumers. */
    public ExpertExecutionService(ExpertDefinitionService definitions, TaskRepository tasks,
            CapabilityHandlerRegistry handlers, ExpertAnalysisPolicy policy, Path workspace,
            List<ExecutionResource> resources) {
        this(definitions, tasks, handlers, ExpertAnalysisPolicyResolver.fixed(policy), workspace, resources);
    }

    @Autowired
    public ExpertExecutionService(ExpertDefinitionService definitions, TaskRepository tasks,
            CapabilityHandlerRegistry handlers, ExpertAnalysisPolicyResolver policies, Path workspace,
            List<ExecutionResource> resources) {
        this.definitions = definitions;
        this.tasks = tasks;
        this.handlers = handlers;
        this.policies = Objects.requireNonNull(policies);
        this.workspace = workspace;
        this.resources = List.copyOf(resources);
    }

    /** Existing HTTP shape composes domain inputs; it is not the generic capability input contract. */
    public record Request(String sql,String question,UUID databaseId,Map<String,Object> explainPlan,Boolean enhanceWithModel,String pattern)
            implements com.lh.eap.sql.DatabaseEvidenceInput, com.lh.eap.local.WorkspaceSearchInput {}

    @Transactional(isolation=Isolation.REPEATABLE_READ,timeout=90)
    public Map<String,Object> execute(String expertId,Request request){
        var manifest=definitions.require(expertId,true);
        if (manifest.agent() != null || policies.describe(manifest).map(item -> "agent".equals(item.executionMode())).orElse(false))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EXPERT_REQUIRES_AGENT_ENTRY");
        var known=new LinkedHashSet<>(handlers.names());
        known.addAll(manifest.expertScopedCapabilities());
        var errors=ExpertGraph.validate(manifest,known,Map.of(),handlers.expertScopedNames(),switchedOff(manifest));
        if(!errors.isEmpty())throw new ResponseStatusException(HttpStatus.BAD_REQUEST,String.join("；",errors));
        var sql=SensitiveData.redact(request.sql()).trim();
        var question=SensitiveData.redact(request.question()).trim();
        if(sql.length()>50000||question.length()>8000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"SQL 最多5万字符，问题最多8000字符");
        if(sql.isBlank()&&question.isBlank()&&(request.pattern()==null||request.pattern().isBlank()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"请填写问题、SQL 或检索目标");
        if(request.explainPlan()!=null&&(JSON.writeValueAsString(request.explainPlan()).length()>100000||SensitiveData.containsSecret(request.explainPlan())))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"执行计划过大或包含凭据");

        // Resolve once from the persisted definition, before resources, tools or model calls.
        var selectedPolicy = policies.resolve(manifest);
        if (selectedPolicy == null || selectedPolicy.isEmpty())
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "EXPERT_ANALYSIS_POLICY_UNAVAILABLE");
        var policy = selectedPolicy.get();
        var binding = manifest.behavior() != null ? manifest.behavior() : policies.legacyBinding().orElse(null);
        var allowedFacts = Set.copyOf(policy.allowedFacts());
        var declaredPackIds=manifest.rulePacks()==null?List.<String>of():manifest.rulePacks();
        var selectedRules=policy.rules(declaredPackIds);
        var resolvedPacks=selectedRules.resolved();
        var missingPacks=selectedRules.missing();

        var id=UUID.randomUUID();
        var goal=!question.isBlank()?question:!sql.isBlank()?sql:SensitiveData.redact(request.pattern());
        // Everything expert-scoped is bound to this one execution and released with it.
        try(var resourceScope=ExecutionResourceScope.open(resources,id,expertId)){
            return executeGraph(new Run(id,expertId,manifest,request,sql,question,goal,declaredPackIds,resolvedPacks,missingPacks,policy,allowedFacts,binding));
        }
    }

    private record Run(UUID id,String expertId,ExpertManifest manifest,Request request,String sql,
            String question,String goal,List<String> declaredPackIds,List<RulePack> resolvedPacks,
            List<String> missingPacks,ExpertAnalysisPolicy policy,Set<String> allowedFacts,
            com.lh.eap.domain.model.ExpertBehaviorBinding behavior){}

    private Map<String,Object> executeGraph(Run ctx){
        var id=ctx.id();var expertId=ctx.expertId();var manifest=ctx.manifest();var request=ctx.request();
        var sql=ctx.sql();var question=ctx.question();var goal=ctx.goal();
        var policy=ctx.policy();
        var declaredPackIds=ctx.declaredPackIds();var resolvedPacks=ctx.resolvedPacks();var missingPacks=ctx.missingPacks();
        var observations=new ArrayList<Observation>();
        var outcomes=new LinkedHashMap<String,Map<String,Object>>();
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
        long schedulingStarted = System.nanoTime();
        var grants=definitions.knowledgeGrants(expertId).stream().filter(key->manifest.knowledgeBases()!=null&&manifest.knowledgeBases().contains(key.toString())).toList();
        log.info("Expert execution {} started: expert={}, nodes={}, rulePacks={}",id,expertId,manifest.steps().size(),declaredPackIds);
        var originalSteps = new LinkedHashMap<String, ExpertManifest.Step>();
        manifest.steps().forEach(step -> originalSteps.put(step.id(), step));
        // Preserve the existing budget's inclusion of the grant lookup and preparation.
        var remainingBudget = Duration.ofNanos(Math.max(0, 45_000_000_000L - (System.nanoTime() - schedulingStarted)));
        var workflowOutcome = new FixedWorkflowRunner().run(ExpertGraph.definition(manifest), remainingBudget,
                workflowStep -> {
                    var step = originalSteps.get(workflowStep.id());
                    try {
                        var result = run(step,request,sql,question,expertId,id,manifest,grants,facts,analysis,advice,evidence,resolvedPacks,ctx.allowedFacts());
                        executed.add(step.capability());
                        return result;
                    } catch (RuntimeException error) {
                        log.warn("Expert execution {} node {} failed: {}", id, step.id(), error.getClass().getSimpleName());
                        return new NodeResult(false,false,"能力执行失败，请查看后端日志；敏感上下文不会写入日志",Map.of());
                    }
                }, outcome -> {
                    var step = outcome.step();
                    var result = outcome.result();
                    var state = outcome.state();
                    var metadata=new LinkedHashMap<String,Object>(Map.of("nodeId",step.id(),"state",state,"required",step.required(),"expertId",expertId));
                    if(ctx.behavior()!=null)metadata.put("behavior",Map.of("id",ctx.behavior().id(),"version",ctx.behavior().version()));
                    observations.add(new Observation(step.capability(),result.success(),result.success()?0:2,SensitiveData.redact(JSON.writeValueAsString(result.data())),result.success()?"":result.message(),metadata));
                    outcomes.put(step.id(),Map.of("id",step.id(),"label",Objects.toString(step.label(),step.capability()),"capability",step.capability(),"state",state,"message",result.message(),"data",result.data()));
                    log.info("Expert execution {} node {}: capability={}, state={}",id,step.id(),step.capability(),state);
                });
        failed = workflowOutcome.failed();
        incomplete |= workflowOutcome.incomplete();

        // Judgment stage: one evaluation over every fact the graph managed to produce.
        var judgement=policy.judge(analysis,resolvedPacks,executed);
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

        var enhancement=policy.enhance(new ExpertAnalysisPolicy.Evidence(sql,question,analysis,evidence,List.copyOf(advice)),
                failed,Boolean.TRUE.equals(request.enhanceWithModel()));
        String modelAdvice=enhancement.advice();
        if(modelAdvice!=null)incomplete=true;
        var status=failed?"failed":incomplete?"partial":"completed";
        var decision=failed?"rejected":incomplete?"needs-review":"accepted";
        // One computation, two consumers: the response field and the persisted column must not be able to
        // disagree, or the overview would report a different route than the result page shows.
        var modelEnhancement=enhancement.state();
        tasks.save(id,goal,status,decision,modelEnhancement,observations);
        var response=new LinkedHashMap<String,Object>();
        response.put("id",id);response.put("expertId",expertId);response.put("goal",goal);
        if(ctx.behavior()!=null)response.put("behavior",Map.of("id",ctx.behavior().id(),"version",ctx.behavior().version()));
        response.put("status",status);response.put("decision",decision);response.put("sql",sql);response.put("advice",advice);
        response.put("rulePacks",policy.summarize(resolvedPacks));
        response.put("rulePackRequirements",judgement.get("ruleCapabilities"));
        response.put("executedCapabilities",List.copyOf(executed));
        response.put("deterministicAnalysis",analysis);response.put("knowledgeEvidence",evidence);response.put("observations",observations);
        response.put("nodes",new ArrayList<>(outcomes.values()));response.put("expertAdvice",modelAdvice);
        response.put("modelAdvisor",enhancement.advisor());
        response.put("analysisMode",modelAdvice==null?"deterministic-workflow":"deterministic-with-unverified-model-observation");
        response.put("modelEnhancement",modelEnhancement);
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
            Map<String,Object> analysis,List<String> advice,List<Map<String,Object>> evidence,List<RulePack> packs,Set<String> allowedFacts){
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
                facts,analysis,advice,evidence,packs,workspace, allowedFacts));
    }

}
