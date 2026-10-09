package com.lh.eap.web;

import com.lh.eap.rules.RulePackService;
import java.util.*;
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
public class ExpertDefinitionService {
    private final JdbcTemplate jdbc;
    private final RulePackService rulePacks;
    private final McpServerRegistry mcpServers;
    private final CapabilitySettings settings;

    public ExpertDefinitionService(JdbcTemplate jdbc, RulePackService rulePacks, McpServerRegistry mcpServers) {
        this(jdbc, rulePacks, mcpServers, new CapabilitySettings(jdbc, new CapabilityUsage(jdbc)));
    }

    public ExpertDefinitionService(JdbcTemplate jdbc, RulePackService rulePacks, McpServerRegistry mcpServers,
                                   CapabilitySettings settings) {
        this.jdbc = jdbc;
        this.rulePacks = rulePacks;
        this.mcpServers = mcpServers;
        this.settings = settings;
    }

    public ExpertManifest require(String id, boolean active) {
        var records = jdbc.queryForList("SELECT manifest::text AS manifest,enabled FROM eap.expert_definition WHERE id=?", id);
        if (records.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "专家不存在");
        if (active && !Boolean.TRUE.equals(records.getFirst().get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "专家仍为草稿，请先启用并授权");
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
        checkReferences(manifest.knowledgeBases(), "eap.knowledge_base", "知识库", errors);
        checkReferences(manifest.databaseProfiles(), "eap.database_profile", "数据库资料", errors);
        errors.addAll(validateRulePackReferences(manifest.rulePacks()));
        return errors;
    }

    /**
     * Structural validation plus the rule pack ↔ capability contract, the expert-scope authorisation and
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
        return ExpertGraph.validate(manifest, knownCapabilities(),
                rulePacks.requirements(manifest.rulePacks()), expertScopedCapabilities(), settings.disabled());
    }

    /**
     * The vocabulary a manifest may reference: the platform capabilities, plus the tools of registered,
     * enabled and trusted MCP servers. A manifest cannot add to this set by naming a tool.
     */
    public Set<String> knownCapabilities() {
        var known = new LinkedHashSet<>(ExpertGraph.CAPABILITIES);
        known.addAll(mcpServers.capabilityIds());
        return known;
    }

    /** Capabilities that exist but are never globally enabled: today, the registered MCP tools. */
    public Set<String> expertScopedCapabilities() { return mcpServers.capabilityIds(); }

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
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"专家不存在");
        if(Boolean.TRUE.equals(rows.getFirst().get("builtin"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"内置专家不可就地授权，请复制为自定义专家后编辑");
        var manifest=ExpertManifest.parse((String)rows.getFirst().get("manifest"));
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
