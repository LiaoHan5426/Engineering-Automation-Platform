package com.lh.eap.web;

import com.lh.eap.rules.RuleEngine;
import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePackService;
import com.lh.eap.rules.RulePacks;
import com.lh.eap.rules.SqlFactExtractor;
import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Rule pack CRUD.
 *
 * <p>This is the API behind "add your own rules like a knowledge base". Rules are ordinary JSON data:
 * an operator can create, edit, disable or delete a pack, point an expert at it, and immediately see
 * the effect — no rebuild, no redeploy.
 *
 * <p>Shipped packs ({@code builtin}) are read-only and reserve their ids; copy one to a new id to
 * customise it. The dry-run endpoint lets the console show "what would these rules say about this
 * SQL" before anything is saved.
 */
@RestController
@RequestMapping("/api/rule-packs")
public class RulePackController {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final RulePackService rulePacks;
    private final JdbcTemplate jdbc;

    public RulePackController(RulePackService rulePacks, JdbcTemplate jdbc) {
        this.rulePacks = rulePacks;
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> list() { return Map.of("items", rulePacks.catalog()); }

    /** Fact and operator vocabulary the rule editor writes against. */
    @GetMapping("/vocabulary")
    public Map<String, Object> vocabulary() {
        var result = new LinkedHashMap<String, Object>();
        result.put("facts", SqlFactVocabulary.FACTS);
        result.put("operators", SqlFactVocabulary.OPERATORS.stream().sorted().toList());
        result.put("producers", SqlFactVocabulary.producers().stream().sorted().toList());
        return result;
    }

    @GetMapping("/{id}")
    public Map<String, Object> get(@PathVariable String id) {
        var pack = rulePacks.find(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "规则包不存在或未启用"));
        var result = new LinkedHashMap<String, Object>();
        result.put("manifest", RulePacks.serialize(pack));
        result.put("shipped", rulePacks.isShipped(id));
        result.put("editable", !rulePacks.isShipped(id));
        result.put("requirements", Map.of(
                "declared", List.copyOf(pack.declaredCapabilities()),
                "derived", List.copyOf(SqlFactVocabulary.producersOf(RulePacks.referencedFacts(pack))),
                "facts", List.copyOf(RulePacks.referencedFacts(pack))));
        return result;
    }

    @PostMapping("/validate")
    public Map<String, Object> validate(@RequestBody PackRequest request) { return validation(request == null ? null : request.manifest()); }

    @PostMapping
    @Transactional
    public Map<String, Object> create(@RequestBody PackRequest request) {
        var errors = new ArrayList<>(validationErrors(request == null ? null : request.manifest()));
        var id = packId(request == null ? null : request.manifest());
        if (id != null && rulePacks.isShipped(id)) errors.add("内置规则包标识为保留标识，请复制为新标识后编辑");
        if (!errors.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join("；", errors));
        var pack = RulePacks.parse(request.manifest());
        jdbc.update("INSERT INTO eap.rule_pack(id,name,manifest) VALUES (?,?,?::jsonb) ON CONFLICT(id) DO UPDATE SET name=excluded.name,manifest=excluded.manifest,enabled=true,revision=eap.rule_pack.revision+1,updated_at=now()",
                pack.id(), pack.name(), request.manifest());
        return Map.of("id", pack.id(), "revision", currentRevision(pack.id()));
    }

    @PutMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable String id, @RequestBody PackRequest request) {
        var errors = new ArrayList<>(validationErrors(request == null ? null : request.manifest()));
        if (rulePacks.isShipped(id)) errors.add("内置规则包不可就地修改，请复制为新标识后编辑");
        if (!errors.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join("；", errors));
        var pack = RulePacks.parse(request.manifest());
        if (!Objects.equals(id, pack.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "路径标识与规则包标识不一致");
        var updated = jdbc.update("UPDATE eap.rule_pack SET name=?,manifest=?::jsonb,revision=revision+1,updated_at=now() WHERE id=?",
                pack.name(), request.manifest(), id);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "规则包不存在");
        return Map.of("id", id, "revision", currentRevision(id));
    }

    /** Enables or disables an authored pack without deleting it. */
    @PutMapping("/{id}/activation")
    @Transactional
    public Map<String, Object> activate(@PathVariable String id, @RequestBody Activation request) {
        if (rulePacks.isShipped(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "内置规则包始终启用");
        var updated = jdbc.update("UPDATE eap.rule_pack SET enabled=?,revision=revision+1,updated_at=now() WHERE id=?", request.enabled(), id);
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "规则包不存在");
        return Map.of("id", id, "enabled", request.enabled());
    }

    @DeleteMapping("/{id}")
    @Transactional
    public Map<String, Object> delete(@PathVariable String id) {
        if (rulePacks.isShipped(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "内置规则包不可删除");
        var referenced = jdbc.queryForList("""
                SELECT id FROM eap.expert_definition
                WHERE enabled AND manifest->'rulePacks' @> to_jsonb(?::text)
                """, id);
        if (!referenced.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "规则包正被已启用的专家引用：" + referenced);
        }
        if (jdbc.update("DELETE FROM eap.rule_pack WHERE id=?", id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "规则包不存在");
        }
        return Map.of("id", id, "status", "deleted");
    }

    /**
     * Dry run: evaluates a candidate manifest against a SQL statement without saving anything.
     * This is what makes a rule editor trustworthy — the author sees the exact findings and the exact
     * facts that matched before publishing.
     */
    @PostMapping("/dry-run")
    public Map<String, Object> dryRun(@RequestBody DryRunRequest request) {
        var errors = validationErrors(request == null ? null : request.manifest());
        if (!errors.isEmpty()) return Map.of("valid", false, "errors", errors, "findings", List.of());
        var sql = SensitiveData.redact(request.sql());
        var extraction = SqlFactExtractor.extract(sql);
        var pack = RulePacks.parse(request.manifest());
        var outcome = RuleEngine.evaluate(pack, extraction.facts());
        var result = new LinkedHashMap<String, Object>();
        result.put("valid", true);
        result.put("errors", List.of());
        result.put("parseStatus", extraction.parseStatus());
        result.put("facts", extraction.facts());
        result.put("findings", outcome.findings());
        result.put("rulesFired", outcome.fired());
        result.put("blockedRules", outcome.blocked());
        result.put("severityCounts", outcome.severityCounts());
        result.put("complexity", outcome.complexity());
        result.put("summary", outcome.summary());
        var requirements = new LinkedHashMap<String, Object>();
        requirements.put("declared", List.copyOf(pack.declaredCapabilities()));
        requirements.put("derived", List.copyOf(SqlFactVocabulary.producersOf(RulePacks.referencedFacts(pack))));
        result.put("requirements", requirements);
        result.put("factProducers", SqlFactVocabulary.FACTS_BY_KEY.entrySet().stream()
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().producedBy())));
        return result;
    }

    private Map<String, Object> validation(String manifest) {
        var errors = validationErrors(manifest);
        var result = new LinkedHashMap<String, Object>();
        result.put("valid", errors.isEmpty());
        result.put("errors", errors);
        result.put("requirements", requirements(manifest));
        return result;
    }

    /**
     * The capability requirements a candidate pack would impose: what the author declared and what its
     * facts actually imply. Both are returned so the editor can show the mismatch instead of hiding it.
     */
    private Map<String, Object> requirements(String manifest) {
        var result = new LinkedHashMap<String, Object>();
        try {
            var pack = RulePacks.parse(manifest);
            result.put("declared", List.copyOf(pack.declaredCapabilities()));
            result.put("derived", List.copyOf(SqlFactVocabulary.producersOf(RulePacks.referencedFacts(pack))));
            result.put("facts", List.copyOf(RulePacks.referencedFacts(pack)));
        } catch (RuntimeException error) {
            result.put("declared", List.of());
            result.put("derived", List.of());
            result.put("facts", List.of());
        }
        return result;
    }

    private List<String> validationErrors(String manifest) {
        if (manifest == null || manifest.isBlank()) return List.of("规则包定义为空");
        if (manifest.length() > 200000) return List.of("规则包定义最多20万字符");
        try {
            if (SensitiveData.containsSecret(JSON.readValue(manifest, Map.class))) return List.of("规则包含凭据或连接字符串，请脱敏后保存");
            return RulePacks.validate(RulePacks.parse(manifest));
        } catch (RuntimeException error) {
            return List.of("规则包 JSON 无效或字段类型不正确");
        }
    }

    private String packId(String manifest) {
        try { return RulePacks.parse(manifest).id(); } catch (RuntimeException ignored) { return null; }
    }

    private Object currentRevision(String id) {
        return jdbc.queryForObject("SELECT revision FROM eap.rule_pack WHERE id=?", Object.class, id);
    }

    public record PackRequest(String id, String name, String manifest) { }
    public record DryRunRequest(String sql, String manifest) { }
    public record Activation(boolean enabled) { }
}
