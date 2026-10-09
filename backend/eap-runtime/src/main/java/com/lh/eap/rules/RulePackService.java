package com.lh.eap.rules;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Resolves rule packs by id.
 *
 * <p>Two sources, one contract:
 * <ul>
 *   <li><b>Shipped</b> packs live on the classpath ({@code rules/*.json}), are read-only and reserve
 *       their ids. Copy one to a new id to customise it.</li>
 *   <li><b>Authored</b> packs live in {@code eap.rule_pack} and support full CRUD through the API.</li>
 * </ul>
 * Both are ordinary configuration, so an operator can change what an expert flags without a rebuild.
 */
@Service
public class RulePackService {
    private final JdbcTemplate jdbc;

    public RulePackService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<RulePack> shipped() { return RulePacks.builtin(); }

    public boolean isShipped(String id) { return RulePacks.builtinById(id).isPresent(); }

    public Optional<RulePack> find(String id) {
        if (id == null || id.isBlank()) return Optional.empty();
        var rows = jdbc.queryForList("SELECT manifest::text AS manifest FROM eap.rule_pack WHERE id=? AND enabled=true", id);
        if (!rows.isEmpty()) {
            try { return Optional.of(RulePacks.parse((String) rows.getFirst().get("manifest"))); }
            catch (RuntimeException ignored) { return Optional.empty(); }
        }
        return RulePacks.builtinById(id);
    }

    public List<RulePack> resolve(List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        var packs = new ArrayList<RulePack>();
        for (var id : ids) find(id).ifPresent(packs::add);
        return List.copyOf(packs);
    }

    public List<String> unresolved(List<String> ids) {
        if (ids == null || ids.isEmpty()) return List.of();
        var missing = new ArrayList<String>();
        for (var id : ids) if (find(id).isEmpty()) missing.add(id);
        return List.copyOf(missing);
    }

    /**
     * Capabilities each resolvable pack needs, keyed by pack id.
     *
     * <p>Used by expert validation: an expert may only reference a pack whose required capabilities have
     * a node in its graph, otherwise the pack's rules could never fire.
     */
    public Map<String, Set<String>> requirements(List<String> ids) {
        if (ids == null || ids.isEmpty()) return Map.of();
        var result = new TreeMap<String, Set<String>>();
        for (var id : ids) find(id).ifPresent(pack -> result.put(id, RulePacks.requiredCapabilities(pack)));
        return Map.copyOf(result);
    }

    public List<Map<String, Object>> catalog() {
        var items = new ArrayList<Map<String, Object>>();
        for (var pack : RulePacks.builtin()) items.add(summary(pack, true, true, 0));
        for (var row : jdbc.queryForList(
                "SELECT id,enabled,revision,manifest::text AS manifest FROM eap.rule_pack ORDER BY updated_at DESC")) {
            RulePack pack = null;
            try { pack = RulePacks.parse(String.valueOf(row.get("manifest"))); } catch (RuntimeException ignored) { }
            items.add(summary(pack, false, Boolean.TRUE.equals(row.get("enabled")),
                    row.get("revision") instanceof Number number ? number.intValue() : 0));
        }
        return items;
    }

    private static Map<String, Object> summary(RulePack pack, boolean shipped, boolean enabled, int revision) {
        var summary = new LinkedHashMap<String, Object>();
        summary.put("id", pack == null ? "unparsable" : pack.id());
        summary.put("name", pack == null ? "无法解析的规则包" : pack.name());
        summary.put("description", pack == null ? null : pack.description());
        summary.put("version", pack == null ? null : pack.version());
        summary.put("ruleCount", pack == null || pack.rules() == null ? 0 : pack.rules().size());
        summary.put("shipped", shipped);
        summary.put("editable", !shipped);
        summary.put("enabled", enabled);
        summary.put("revision", revision);
        summary.put("requires", pack == null ? List.of() : List.copyOf(RulePacks.requiredCapabilities(pack)));
        summary.put("requiredFacts", pack == null ? List.of() : List.copyOf(RulePacks.referencedFacts(pack)));
        return summary;
    }
}
