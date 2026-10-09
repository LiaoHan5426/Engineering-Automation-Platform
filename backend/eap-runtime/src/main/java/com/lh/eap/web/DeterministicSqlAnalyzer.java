package com.lh.eap.web;

import com.lh.eap.rules.RuleEngine;
import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePacks;
import com.lh.eap.rules.SqlFactExtractor;
import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;

/**
 * SQL analysis facade.
 *
 * <p>It contains <em>no</em> domain rules, and it is deliberately split into two stages that the
 * executor runs at different moments:
 *
 * <ol>
 *   <li>{@link #extract(String)} — structural facts and parse metadata only. This is what the
 *       {@code sql.parse} capability publishes, and it is available to the rest of the graph.</li>
 *   <li>{@link #judge(Map, List, Set)} — runs the expert's rule packs over the <em>accumulated</em> fact
 *       base, after every capability has had its turn. That is what lets one rule combine facts from
 *       several capabilities (statement shape plus snapshot plus plan) instead of only from SQL.</li>
 * </ol>
 *
 * <p>Which checks run, how severe they are and what they advise is decided entirely by the rule packs
 * passed in — see {@code classpath:rules/*.json}. {@link #analyze(String, List)} keeps the two stages
 * glued together for the standalone (non-expert) callers: dry-run and unit tests.
 */
final class DeterministicSqlAnalyzer {
    static final String ENGINE_VERSION = "sql-analyzer/4";

    private DeterministicSqlAnalyzer() { }

    /** Analyzes using the built-in rule packs, as if every fact producer had run. */
    static Map<String, Object> analyze(String sql) {
        return analyze(sql, RulePacks.builtin());
    }

    /** Analyzes using exactly the given rule packs (already resolved from the expert manifest). */
    static Map<String, Object> analyze(String sql, List<RulePack> packs) {
        var result = extract(sql);
        result.putAll(judge(result, packs, Set.of(SqlFactVocabulary.SQL_PARSE)));
        return result;
    }

    /** Stage 1: facts and structure. No severity, no advice, no judgement of any kind. */
    @SuppressWarnings("unchecked")
    static Map<String, Object> extract(String sql) {
        var extraction = SqlFactExtractor.extract(sql);
        var result = new LinkedHashMap<String, Object>();
        result.put("parseStatus", extraction.parseStatus());
        result.put("statementType", extraction.statementType());
        result.put("normalizedSql", extraction.normalizedSql());
        result.put("engineVersion", ENGINE_VERSION);
        if (extraction.error() != null) result.put("error", extraction.error());
        result.put("tables", extraction.tables());
        result.put("joinKeys", extraction.joinKeys());
        result.put("joinColumns", extraction.joinColumns());
        result.put("joinKeyAdvice", extraction.joinKeyAdvice());
        result.put("facts", new LinkedHashMap<String, Object>(extraction.facts()));
        return result;
    }

    /**
     * Stage 2: judgement over the whole run's evidence.
     *
     * @param analysis              accumulated run evidence; {@code facts} is what rules are evaluated against
     * @param packs                 resolved rule packs declared by the expert
     * @param availableCapabilities capabilities that actually produced facts in this run
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> judge(Map<String, Object> analysis, List<RulePack> packs,
                                    Set<String> availableCapabilities) {
        var facts = (Map<String, Object>) analysis.getOrDefault("facts", Map.of());
        var available = availableCapabilities == null ? null : Set.copyOf(availableCapabilities);
        var outcome = RuleEngine.evaluate(RulePacks.merged(packs), facts, available);
        boolean invalid = "invalid".equals(analysis.get("parseStatus"));

        var suggestions = new ArrayList<String>();
        var joinKeyAdvice = analysis.get("joinKeyAdvice");
        if (joinKeyAdvice instanceof List<?> advice) advice.forEach(item -> suggestions.add(String.valueOf(item)));
        suggestions.addAll(outcome.suggestions());
        if (suggestions.isEmpty()) {
            suggestions.add("已解析 " + analysis.getOrDefault("statementType", "语句")
                    + "。当前没有足够结构证据支持确定性改写，请提供业务语义、表结构与执行计划。");
        }

        var result = new LinkedHashMap<String, Object>();
        result.put("findings", outcome.findings());
        result.put("rulesFired", outcome.fired());
        result.put("blockedRules", outcome.blocked().stream().map(blocked -> {
            var entry = new LinkedHashMap<String, Object>();
            entry.put("rule", blocked.rule());
            entry.put("missingFacts", blocked.missingFacts());
            entry.put("missingCapabilities", blocked.missingCapabilities());
            return entry;
        }).toList());
        result.put("ruleCapabilities", capabilityCheck(packs, available));
        result.put("suggestions", List.copyOf(suggestions));
        result.put("severityCounts", outcome.severityCounts());
        result.put("complexity", outcome.complexity());
        result.put("deterministicConfidence", invalid ? 1.0 : outcome.confidence());
        result.put("requiresModelReview", !invalid && outcome.requiresModelReview());
        result.put("summary", outcome.summary());
        return result;
    }

    /**
     * Which capabilities each referenced pack needs, and whether this run could supply them. This is
     * the bridge between "rule pack requires capability" and "expert graph provides capability": the
     * console shows it, and the executor turns an unmet requirement into an explicit degradation.
     */
    static List<Map<String, Object>> capabilityCheck(List<RulePack> packs, Set<String> availableCapabilities) {
        var checks = new ArrayList<Map<String, Object>>();
        for (var pack : packs) {
            if (pack == null) continue;
            var required = RulePacks.requiredCapabilities(pack);
            var entry = new LinkedHashMap<String, Object>();
            entry.put("id", pack.id());
            entry.put("required", List.copyOf(required));
            if (availableCapabilities == null) {
                entry.put("met", true);
                entry.put("missing", List.of());
            } else {
                var missing = new TreeSet<>(required);
                missing.removeAll(availableCapabilities);
                entry.put("met", missing.isEmpty());
                entry.put("missing", List.copyOf(missing));
            }
            checks.add(entry);
        }
        return checks;
    }
}
