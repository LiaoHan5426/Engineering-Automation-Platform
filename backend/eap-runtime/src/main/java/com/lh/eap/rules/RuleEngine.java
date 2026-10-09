package com.lh.eap.rules;

import java.util.*;
import java.util.regex.Pattern;

/**
 * Generic interpreter for {@link RulePack}s.
 *
 * <p>It knows nothing about SQL. It evaluates declarative conditions against a flat map of facts and
 * emits findings with a stable shape ({@code code/category/severity/evidence/suggestion/confidence}).
 * Because all domain knowledge lives in the pack, the same engine can drive other experts by feeding
 * it a different fact base.
 *
 * <p>Texts may interpolate facts using {@code {{fact.key}}} placeholders, so a single rule can produce
 * context-aware evidence without any code change.
 */
public final class RuleEngine {
    private RuleEngine() { }

    /**
     * A rule that could not be judged because the capability producing its facts did not run.
     *
     * <p>Reporting this is the whole point: a rule whose facts come from {@code database.explain} and
     * whose expert has no such node must never look like "no problem found".
     */
    public record BlockedRule(String rule, List<String> missingFacts, List<String> missingCapabilities) { }

    public record Outcome(List<String> fired, List<Map<String, Object>> findings,
                          Map<String, Integer> severityCounts, List<String> suggestions,
                          List<BlockedRule> blocked, double maxWeight, int complexity, double confidence,
                          boolean requiresModelReview, String summary) { }

    /** Evaluates assuming every fact producer ran (used by dry-run and by the standalone facade). */
    public static Outcome evaluate(RulePack pack, Map<String, Object> facts) {
        return evaluate(pack, facts, null);
    }

    /**
     * Evaluates with knowledge of which capabilities actually ran.
     *
     * @param availableCapabilities capability ids that produced facts in this run; {@code null} means
     *                              "assume all of them", which is what a rule editor wants
     */
    public static Outcome evaluate(RulePack pack, Map<String, Object> facts, Set<String> availableCapabilities) {
        var safeFacts = facts == null ? Map.<String, Object>of() : facts;
        var policy = pack == null || pack.policy() == null
                ? new RulePack.Policy(null, null, null, null, null, null, null)
                : pack.policy();

        var fired = new ArrayList<String>();
        var findings = new ArrayList<Map<String, Object>>();
        var suggestions = new ArrayList<String>();
        var blocked = new ArrayList<BlockedRule>();
        var counts = new LinkedHashMap<String, Integer>();
        double maxWeight = 0;

        if (pack != null && pack.rules() != null) {
            for (var rule : pack.rules()) {
                if (rule == null) continue;
                var referenced = referencedFacts(rule);
                var unmet = unmetCapabilities(referenced, availableCapabilities);
                if (!unmet.isEmpty()) {
                    blocked.add(new BlockedRule(rule.id(), unmetFacts(referenced, unmet), List.copyOf(unmet)));
                    continue;
                }
                if (!matches(rule.when(), safeFacts)) continue;
                var severity = resolveSeverity(rule, safeFacts);
                var weight = policy.weightOf(severity);
                fired.add(rule.id());
                counts.merge(severity, 1, Integer::sum);
                maxWeight = Math.max(maxWeight, weight);

                var finding = new LinkedHashMap<String, Object>();
                finding.put("code", rule.id());
                if (rule.title() != null) finding.put("title", rule.title());
                finding.put("category", rule.category() == null ? "规则" : rule.category());
                finding.put("severity", severity);
                finding.put("evidence", interpolate(rule.evidence(), safeFacts));
                finding.put("suggestion", interpolate(rule.suggestion(), safeFacts));
                finding.put("confidence", rule.confidence() == null ? weight : rule.confidence());
                findings.add(finding);
                if (rule.suggestion() != null) suggestions.add(interpolate(rule.suggestion(), safeFacts));
            }
        }

        int complexity = complexity(policy, safeFacts);
        boolean clean = findings.isEmpty();
        boolean actionable = maxWeight >= policy.actionableWeightOr(0.75);
        double confidence = clean ? orDefault(policy.cleanConfidence(), 0.9)
                : actionable ? orDefault(policy.actionableConfidence(), 0.85)
                : orDefault(policy.partialConfidence(), 0.5);
        boolean review = !actionable && complexity >= orDefault(policy.reviewComplexityThreshold(), 4);

        return new Outcome(List.copyOf(fired), List.copyOf(findings), counts, List.copyOf(suggestions),
                List.copyOf(blocked), maxWeight, complexity, confidence, review,
                summary(findings.size(), counts, review, blocked.size()));
    }

    /** Facts a single rule reads, including its severity escalations. */
    private static Set<String> referencedFacts(RulePack.Rule rule) {
        var facts = new TreeSet<String>();
        RulePacks.collectFacts(rule.when(), facts);
        if (rule.severityWhen() != null) {
            for (var override : rule.severityWhen()) {
                if (override != null) RulePacks.collectFacts(override.when(), facts);
            }
        }
        return facts;
    }

    /** Capabilities that did not run but are required by the referenced facts. */
    private static Set<String> unmetCapabilities(Set<String> referencedFacts, Set<String> availableCapabilities) {
        if (availableCapabilities == null) return Set.of();
        var unmet = new TreeSet<String>();
        for (var producer : SqlFactVocabulary.producersOf(referencedFacts)) {
            if (!availableCapabilities.contains(producer)) unmet.add(producer);
        }
        return unmet;
    }

    private static List<String> unmetFacts(Set<String> referencedFacts, Set<String> unmetCapabilities) {
        var result = new ArrayList<String>();
        for (var fact : referencedFacts) {
            var declaration = SqlFactVocabulary.FACTS_BY_KEY.get(fact);
            if (declaration != null && unmetCapabilities.contains(declaration.producedBy())) result.add(fact);
        }
        return List.copyOf(result);
    }

    static String summary(int total, Map<String, Integer> counts, boolean review, int blocked) {
        var suffix = blocked == 0 ? "" : "；另有 " + blocked + " 条规则因所需能力未执行而未能判定，结果不完整。";
        if (total == 0) {
            return (blocked == 0 ? "未触发确定性规则；结构上未见明显反模式。" : "未触发确定性规则。")
                    + suffix;
        }
        return "触发 " + total + " 条规则（" + counts + "）"
                + (review
                ? "；存在结构性复杂度，确定性证据不足，建议补充压缩后的模型复核。"
                : "；确定性证据已足以给出可执行建议。")
                + suffix;
    }

    private static String resolveSeverity(RulePack.Rule rule, Map<String, Object> facts) {
        if (rule.severityWhen() != null) {
            for (var override : rule.severityWhen()) {
                if (override != null && override.severity() != null && matches(override.when(), facts)) {
                    return override.severity();
                }
            }
        }
        return rule.severity() == null ? "info" : rule.severity();
    }

    static boolean matches(RulePack.Condition condition, Map<String, Object> facts) {
        if (condition == null) return true;
        if (condition.all() != null) return condition.all().stream().allMatch(child -> matches(child, facts));
        if (condition.any() != null) return condition.any().stream().anyMatch(child -> matches(child, facts));
        if (condition.not() != null) return !matches(condition.not(), facts);
        if (condition.fact() == null) return false;

        var actual = facts.get(condition.fact());
        var op = condition.op() == null ? "eq" : condition.op();
        var expected = condition.value();
        return switch (op) {
            case "exists" -> actual != null && !Boolean.FALSE.equals(actual);
            case "absent" -> actual == null || Boolean.FALSE.equals(actual);
            case "eq" -> equalValue(actual, expected);
            case "ne" -> !equalValue(actual, expected);
            case "gt" -> number(actual) > number(expected);
            case "gte" -> number(actual) >= number(expected);
            case "lt" -> number(actual) < number(expected);
            case "lte" -> number(actual) <= number(expected);
            case "in" -> expected instanceof List<?> list
                    && list.stream().anyMatch(candidate -> equalValue(actual, candidate));
            case "contains" -> actual instanceof String text
                    ? text.contains(String.valueOf(expected))
                    : actual instanceof Collection<?> collection && collection.contains(expected);
            case "matches" -> actual != null && Pattern.compile(String.valueOf(expected),
                    Pattern.CASE_INSENSITIVE).matcher(String.valueOf(actual)).find();
            default -> false;
        };
    }

    private static boolean equalValue(Object actual, Object expected) {
        if (actual == null || expected == null) return actual == expected;
        var left = numberOrNull(actual);
        var right = numberOrNull(expected);
        if (left != null && right != null) return left.doubleValue() == right.doubleValue();
        return actual.equals(expected) || String.valueOf(actual).equals(String.valueOf(expected));
    }

    static String interpolate(String template, Map<String, Object> facts) {
        if (template == null || !template.contains("{{")) return template;
        var result = new StringBuilder();
        int cursor = 0;
        while (true) {
            int start = template.indexOf("{{", cursor);
            if (start < 0) { result.append(template, cursor, template.length()); break; }
            int end = template.indexOf("}}", start + 2);
            if (end < 0) { result.append(template, cursor, template.length()); break; }
            result.append(template, cursor, start);
            var key = template.substring(start + 2, end).trim();
            var value = facts.get(key);
            result.append(value == null ? "" : String.valueOf(value));
            cursor = end + 2;
        }
        return result.toString();
    }

    private static int complexity(RulePack.Policy policy, Map<String, Object> facts) {
        var shape = policy.complexity();
        if (shape == null) return 0;
        int total = 0;
        if (shape.weights() != null) {
            for (var entry : shape.weights().entrySet()) {
                total += entry.getValue() * (int) number(facts.get(entry.getKey()));
            }
        }
        var fact = shape.multiTableFact() == null ? "table.count" : shape.multiTableFact();
        var above = shape.multiTableAbove() == null ? 1 : shape.multiTableAbove();
        var weight = shape.multiTableWeight() == null ? 0 : shape.multiTableWeight();
        if (weight != 0 && number(facts.get(fact)) > above) total += weight;
        return total;
    }

    private static double number(Object value) {
        var parsed = numberOrNull(value);
        return parsed == null ? 0 : parsed;
    }

    private static Double numberOrNull(Object value) {
        if (value instanceof Number number) return number.doubleValue();
        if (value instanceof Boolean flag) return flag ? 1.0 : 0.0;
        if (value instanceof String text) {
            try { return Double.parseDouble(text.trim()); } catch (NumberFormatException ignored) { return null; }
        }
        return null;
    }

    private static double orDefault(Double value, double fallback) { return value == null ? fallback : value; }
    private static int orDefault(Integer value, int fallback) { return value == null ? fallback : value; }
}
