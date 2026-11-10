package com.lh.eap.application.service;
import com.lh.eap.core.DatabaseGrantQuery;
import com.lh.eap.core.ExpertBehaviorCatalog;
import com.lh.eap.persistence.mapper.CliProgramMapper;
import com.lh.eap.error.AgentErrors;

import com.lh.eap.core.ExpertScopedCapabilityQuery;
import com.lh.eap.core.ExpertAnalysisPolicyResolver;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.domain.expert.ExpertGraph;

import com.lh.eap.rules.RulePackQuery;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Expert definition lookup and lifecycle.
 *
 * <p>Shipped and operator-authored experts now share one path: both are rows in
 * {@code eap.expert_definition}. The only difference is the {@code builtin} flag, which protects a
 * shipped expert from being edited in place — copy it to a new id instead. All previous
 * {@code if ("sql-expert".equals(id))} branches are gone.
 */
@Service
public class ExpertDefinitionService implements DatabaseGrantQuery {
    private final JdbcTemplate jdbc;
    private final RulePackQuery rulePacks;
    private final ExpertScopedCapabilityQuery scopedCapabilities;
    private final CapabilitySettings settings;
    private final ExpertAnalysisPolicyResolver policies;
    private CliProgramMapper cliPrograms;

    @Autowired
    public void setCliPrograms(CliProgramMapper cliPrograms) { this.cliPrograms = cliPrograms; }

    /** All authoritative configuration comes from the host, including its capability switches. */
    public ExpertDefinitionService(JdbcTemplate jdbc, RulePackQuery rulePacks, ExpertScopedCapabilityQuery scopedCapabilities,
                                   CapabilitySettings settings, ExpertAnalysisPolicyResolver policies) {
        this.jdbc = jdbc;
        this.rulePacks = Objects.requireNonNull(rulePacks);
        this.scopedCapabilities = Objects.requireNonNull(scopedCapabilities);
        this.settings = Objects.requireNonNull(settings);
        this.policies = Objects.requireNonNull(policies);
    }

    public ExpertAnalysisPolicyResolver behaviorPolicies() { return policies; }

    public List<String> validateBehavior(ExpertManifest manifest) {
        var selected = policies.resolve(manifest);
        return selected != null && selected.isPresent() ? List.of()
                : List.of("专业行为不存在或当前版本不可用，请选择目录中的行为版本");
    }

    public ExpertManifest require(String id, boolean active) {
        var records = jdbc.queryForList("SELECT manifest::text AS manifest,enabled FROM eap.expert_definition WHERE id=?", id);
        if (records.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,AgentErrors.EXPERT_NOT_FOUND.code());
        if (active && !Boolean.TRUE.equals(records.getFirst().get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,AgentErrors.EXPERT_NOT_ENABLED.code());
        }
        return ExpertManifest.parse((String) records.getFirst().get("manifest"));
    }

    public boolean isBuiltin(String id) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT COALESCE((SELECT builtin FROM eap.expert_definition WHERE id=?),false)", Boolean.class, id));
    }

    public List<UUID> knowledgeGrants(String id) {
        return jdbc.query("SELECT knowledge_base_id FROM eap.expert_knowledge_grant WHERE expert_id=?",
                (rs,row)->rs.getObject(1, UUID.class), id);
    }

    public boolean databaseGranted(String id, UUID profile) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM eap.expert_database_grant WHERE expert_id=? AND database_profile_id=?)",
                Boolean.class, id, profile));
    }

    public List<String> validateReferences(ExpertManifest manifest) {
        var errors = new ArrayList<String>();
        errors.addAll(validateBehavior(manifest));
        checkReferences(manifest.knowledgeBases(), "eap.knowledge_base", "知识库", errors);
        checkReferences(manifest.databaseProfiles(), "eap.database_profile", "数据库资料", errors);
        errors.addAll(validateRulePackReferences(manifest.rulePacks()));
        return errors;
    }

    /**
     * Structural validation plus the rule pack ↔ capability contract, the expert-scope authorization and
     * the operator's own capability switches.
     *
     * <p>An expert that references a rule pack without the capability nodes that pack needs would load
     * and run fine, and simply never produce those findings — so it is rejected at save/enable time.
     * The same applies to an MCP tool: the platform does not enable MCP globally, so a node that uses one
     * must have been declared by this expert in {@code mcpTools} and published by a registered, trusted
     * server. Only experts that actually need it can reach it.
     *
     * <p>A capability the operator switched off is reported as switched off, not as missing: the
     * difference decides whether the reader goes looking for a bug or flips a switch back.
     */
    public List<String> validateGraph(ExpertManifest manifest) {
        var behavior = policies.describe(manifest).orElse(null);
        if (behavior != null && "agent".equals(behavior.executionMode())) return validateAgent(manifest, behavior);
        if (manifest.agent() != null) return List.of("固定流程不能携带 agent 定义");
        return ExpertGraph.validate(manifest, knownCapabilities(),
                rulePacks.requirements(manifest.rulePacks()), expertScopedCapabilities(), settings.disabled());
    }

    private List<String> validateAgent(ExpertManifest manifest, ExpertBehaviorCatalog.Descriptor behavior) {
        var errors = new ArrayList<String>();
        if (!"eap/v2".equals(manifest.apiVersion()) || !"Expert".equals(manifest.kind()) || manifest.agent() == null
                || manifest.behavior() == null) return List.of("Agent 必须显式使用 eap/v2 Expert、behavior 和 agent 定义");
        if (manifest.steps() == null || !manifest.steps().isEmpty() || manifest.edges() == null || !manifest.edges().isEmpty())
            errors.add("Agent 使用目标和工具声明，steps/edges 必须为空，不能隐式转换旧 DAG");
        var tools = Set.copyOf(manifest.agent().tools());
        if (!behavior.allowedTools().containsAll(tools)) errors.add("存在专业行为不允许的工具");
        if (!tools.containsAll(behavior.requiredTools())) errors.add("缺少专业行为要求的工具");
        if (!knownCapabilities().containsAll(tools)) errors.add("存在未安装的工具");
        if (!Collections.disjoint(tools, settings.disabled())) errors.add("存在已停用的工具");
        if (!manifest.mcpTools().isEmpty()) errors.add("当前 Agent 行为不支持 MCP 授权声明");
        if (manifest.rules() == null || !manifest.rules().contains("database.credentials.never-expose")
                || !ExpertGraph.RULES.containsAll(manifest.rules())) errors.add("必须保留禁止暴露凭据规则，且不得包含未知规则");
        for (var required : rulePacks.requirements(manifest.rulePacks()).values())
            if (!tools.containsAll(required)) errors.add("Agent 工具声明缺少规则包所需能力");
        return errors;
    }

    /**
     * The vocabulary a manifest may reference: the platform capabilities, plus the tools of registered,
     * enabled and trusted MCP servers. A manifest cannot add to this set by naming a tool.
     */
    public Set<String> knownCapabilities() {
        var known = new LinkedHashSet<>(ExpertGraph.CAPABILITIES);
        if (cliPrograms != null) cliPrograms.operations().forEach(operation -> known.add(operation.capabilityId()));
        known.addAll(scopedCapabilities.capabilityIds());
        return known;
    }

    /** Capabilities that exist but are never globally enabled: today, the registered MCP tools. */
    public Set<String> expertScopedCapabilities() { return scopedCapabilities.capabilityIds(); }

    /** Rule pack references must resolve either to a shipped pack or to an enabled authored pack. */
    public List<String> validateRulePackReferences(List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        if (ids.size() > 50) return List.of("规则包引用最多50项");
        var errors = new ArrayList<String>();
        for (var id : ids) {
            if (id == null || !id.matches("[a-z0-9]+(?:-[a-z0-9]+)*")) {
                errors.add("规则包必须使用小写英文数字和连字符标识：" + id);
                continue;
            }
            if (rulePacks.find(id).isEmpty()) errors.add("规则包不存在或未启用：" + id);
        }
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
        var rows=jdbc.queryForList("SELECT manifest::text AS manifest,builtin FROM eap.expert_definition WHERE id=? FOR UPDATE", id);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,AgentErrors.EXPERT_NOT_FOUND.code());
        if(Boolean.TRUE.equals(rows.getFirst().get("builtin"))) throw new ResponseStatusException(HttpStatus.CONFLICT,AgentErrors.EXPERT_BUILTIN.code());
        var manifest=enabled ? ExpertManifest.parse((String)rows.getFirst().get("manifest")) : null;
        if (enabled) {
            var errors=new ArrayList<>(validateGraph(manifest));errors.addAll(validateReferences(manifest));
            if(!errors.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,String.join("；",errors));
        }
        jdbc.update("DELETE FROM eap.expert_knowledge_grant WHERE expert_id=?",id);
        jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?",id);
        jdbc.update("DELETE FROM eap.expert_mcp_grant WHERE expert_id=?",id);
        if(enabled) {
            for(var key:manifest.knowledgeBases()==null?List.<String>of():manifest.knowledgeBases()) jdbc.update("INSERT INTO eap.expert_knowledge_grant VALUES (?,?) ON CONFLICT DO NOTHING",id,UUID.fromString(key));
            for(var key:manifest.databaseProfiles()==null?List.<String>of():manifest.databaseProfiles()) jdbc.update("INSERT INTO eap.expert_database_grant VALUES (?,?) ON CONFLICT DO NOTHING",id,UUID.fromString(key));
            // Expert-scoped capabilities are granted per expert, never registered globally. The grant is
            // what the run-time registry checks, and disabling the expert revokes it with the others.
            for(var capability:manifest.expertScopedCapabilities()) jdbc.update("INSERT INTO eap.expert_mcp_grant(expert_id,capability) VALUES (?,?) ON CONFLICT DO NOTHING",id,capability);
        }
        jdbc.update("UPDATE eap.expert_definition SET enabled=?,revision=revision+1,updated_at=now() WHERE id=?",enabled,id);
    }
}
