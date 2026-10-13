import type { RuleCondition, RuleFact, RulePackManifest } from "@eap/runtime-client";

/**
 * What a rule pack draft implies, computed in the browser so the editor can refuse a bad edit at the
 * field instead of at the save.
 *
 * The backend is still the authority — it validates the manifest on save and on dry-run — but a round trip
 * cannot say "this rule reads `predicate.foo`, which no capability publishes", and a save-then-reject cycle
 * on every keystroke teaches the author nothing. These four functions mirror the backend's own derivation
 * exactly (`RulePacks.referencedFacts` / `SqlFactVocabulary.producersOf`), so the two can only disagree if
 * one of them is wrong.
 *
 * The consistency rule is one-directional on purpose: `requires.capabilities` may be **wider** than what the
 * facts imply, never narrower. A missing declaration makes "the rule never fires" look identical to
 * "there was nothing to find", which is the failure this whole screen exists to prevent.
 */
export function referencedFacts(manifest: RulePackManifest): string[] {
  const keys = new Set<string>();
  const walk = (condition?: RuleCondition) => {
    if (!condition) return;
    for (const nested of condition.all ?? []) walk(nested);
    for (const nested of condition.any ?? []) walk(nested);
    if (condition.not) walk(condition.not);
    if (condition.fact) keys.add(condition.fact);
  };
  for (const rule of manifest.rules ?? []) {
    walk(rule.when);
    for (const override of rule.severityWhen ?? []) walk(override.when);
  }
  return [...keys].sort();
}

/** Capabilities implied by the facts a draft reads, via the vocabulary's producer index. */
export function derivedCapabilities(manifest: RulePackManifest, facts: RuleFact[]): string[] {
  const producers = new Map(facts.map((fact) => [fact.key, fact.producedBy]));
  return [
    ...new Set(
      referencedFacts(manifest)
        .map((key) => producers.get(key))
        .filter((producer): producer is string => !!producer),
    ),
  ].sort();
}

/** Facts the draft names that the vocabulary does not declare — a rule that can never fire. */
export function unknownFacts(manifest: RulePackManifest, facts: RuleFact[]): string[] {
  const known = new Set(facts.map((fact) => fact.key));
  return referencedFacts(manifest).filter((key) => !known.has(key));
}

/** Capabilities the facts imply but `requires.capabilities` does not declare. */
export function requirementGaps(manifest: RulePackManifest, facts: RuleFact[]): string[] {
  const declared = new Set(manifest.requires?.capabilities ?? []);
  return derivedCapabilities(manifest, facts).filter((capability) => !declared.has(capability));
}
