package com.lh.eap.application.service;

import com.lh.eap.web.dto.*;
import org.springframework.stereotype.Service;

import com.lh.eap.common.SensitiveData;

import com.lh.eap.rules.RuleEngine;
import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePackService;
import com.lh.eap.rules.RulePacks;
import com.lh.eap.rules.SqlFactExtractor;
import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.springframework.http.HttpStatus;
import com.lh.eap.persistence.mapper.RulePackMapper;
import org.springframework.transaction.annotation.Transactional;
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
@Service

public class RulePackManagementService {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final RulePackService rulePacks;
    private final RulePackMapper mapper;

    public RulePackManagementService(RulePackService rulePacks, RulePackMapper mapper) {
        this.rulePacks = rulePacks;
        this.mapper = mapper;
    }

    public Map<String, Object> list() { return Map.of("items", rulePacks.catalog()); }

    /** Fact and operator vocabulary the rule editor writes against. */

    public Map<String, Object> vocabulary() {
        var result = new LinkedHashMap<String, Object>();
        result.put("facts", SqlFactVocabulary.FACTS);
        result.put("operators", SqlFactVocabulary.OPERATORS.stream().sorted().toList());
        result.put("producers", SqlFactVocabulary.producers().stream().sorted().toList());
        return result;
    }

    public Map<String, Object> get(String id) {
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

    public Map<String, Object> validate(RulePackRequest request) { return validation(request == null ? null : request.manifest()); }

    @Transactional
    public Map<String, Object> create(RulePackRequest request) {
        var errors = new ArrayList<>(validationErrors(request == null ? null : request.manifest()));
        var id = packId(request == null ? null : request.manifest());
        if (id != null && rulePacks.isShipped(id)) errors.add("内置规则包标识为保留标识，请复制为新标识后编辑");
        if (!errors.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join("；", errors));
        var pack = RulePacks.parse(request.manifest());
        mapper.save(pack.id(), pack.name(), request.manifest());
        return Map.of("id", pack.id(), "revision", currentRevision(pack.id()));
    }

    @Transactional
    public Map<String, Object> update(String id, RulePackRequest request) {
        var errors = new ArrayList<>(validationErrors(request == null ? null : request.manifest()));
        if (rulePacks.isShipped(id)) errors.add("内置规则包不可就地修改，请复制为新标识后编辑");
        if (!errors.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, String.join("；", errors));
        var pack = RulePacks.parse(request.manifest());
        if (!Objects.equals(id, pack.id())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "路径标识与规则包标识不一致");
        var updated = mapper.update(id, pack.name(), request.manifest());
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "规则包不存在");
        return Map.of("id", id, "revision", currentRevision(id));
    }

    /** Enables or disables an authored pack without deleting it. */

    @Transactional
    public Map<String, Object> activate(String id, RuleActivationRequest request) {
        if (rulePacks.isShipped(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "内置规则包始终启用");
        var updated = mapper.activate(id, request.enabled());
        if (updated == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "规则包不存在");
        return Map.of("id", id, "enabled", request.enabled());
    }

    @Transactional
    public Map<String, Object> delete(String id) {
        if (rulePacks.isShipped(id)) throw new ResponseStatusException(HttpStatus.CONFLICT, "内置规则包不可删除");
        var referenced = mapper.enabledReferences(id);
        if (!referenced.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "规则包正被已启用的专家引用：" + referenced);
        }
        if (mapper.delete(id) == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "规则包不存在");
        }
        return Map.of("id", id, "status", "deleted");
    }

    /**
     * Dry run: evaluates a candidate manifest against a SQL statement without saving anything.
     * This is what makes a rule editor trustworthy — the author sees the exact findings and the exact
     * facts that matched before publishing.
     */

    public Map<String, Object> dryRun(RuleDryRunRequest request) {
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
        return mapper.revision(id);
    }

}
