package com.lh.eap.rules;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/**
 * A declarative rule pack.
 *
 * <p>This is the data that defines an expert's "intelligence". A rule pack is authored as JSON
 * (ship-time under {@code classpath:rules/*.json} or run-time through the rule pack API) and is
 * interpreted by {@link RuleEngine}. Adding, editing, disabling or deleting a rule changes behaviour
 * without recompiling or redeploying anything — the code only extracts structural facts.
 *
 * <p><b>A pack must declare the capabilities it needs.</b> Its rules read facts, every fact is produced
 * by exactly one capability, so "which capability does this pack need" is a question with a single
 * correct answer — and a rule whose producer never runs is a rule that silently never fires. The pack
 * therefore states {@code requires.capabilities} explicitly, the platform checks it against the facts
 * the rules actually reference, and an expert referencing the pack must contain the matching nodes.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record RulePack(String apiVersion, String kind, String id, String name, Integer version,
                       String description, Policy policy, List<Rule> rules, Requires requires) {

    public static final Map<String, Double> DEFAULT_SEVERITY_WEIGHTS =
            Map.of("critical", 1.0, "high", 0.75, "medium", 0.45, "low", 0.2, "info", 0.05);

    /** Backwards-compatible shape for packs authored before capability requirements existed. */
    public RulePack(String apiVersion, String kind, String id, String name, Integer version,
                    String description, Policy policy, List<Rule> rules) {
        this(apiVersion, kind, id, name, version, description, policy, rules, null);
    }

    /**
     * The capabilities a pack depends on.
     *
     * @param capabilities capability ids whose facts this pack reads; must cover every fact referenced
     *                     by the rules (checked by {@link RulePacks#validate})
     * @param note         free-form explanation shown in the console
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Requires(List<String> capabilities, String note) { }

    public List<String> declaredCapabilities() {
        return requires == null || requires.capabilities() == null ? List.of() : List.copyOf(requires.capabilities());
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Rule(String id, String title, String category, String severity, Condition when,
                       List<SeverityOverride> severityWhen, String evidence, String suggestion,
                       Double confidence) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SeverityOverride(Condition when, String severity) { }

    /**
     * A condition tree. Either a combinator ({@code all} / {@code any} / {@code not}) or a leaf that
     * compares one fact against a literal value.
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Condition(String fact, String op, Object value, List<Condition> all,
                            List<Condition> any, Condition not) { }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Policy(Map<String, Double> severityWeights, Double actionableWeight,
                         ComplexityPolicy complexity, Integer reviewComplexityThreshold,
                         Double cleanConfidence, Double actionableConfidence, Double partialConfidence) {

        public double weightOf(String severity) {
            var weights = severityWeights == null ? DEFAULT_SEVERITY_WEIGHTS : severityWeights;
            return weights.getOrDefault(severity, 0.2);
        }

        public double actionableWeightOr(double fallback) {
            return actionableWeight == null ? fallback : actionableWeight;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ComplexityPolicy(Map<String, Integer> weights, Integer multiTableWeight,
                                   String multiTableFact, Integer multiTableAbove) { }
}
