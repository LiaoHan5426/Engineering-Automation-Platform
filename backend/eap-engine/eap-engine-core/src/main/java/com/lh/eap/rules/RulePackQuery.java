package com.lh.eap.rules;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** Read-only rule configuration selected by the host; no rule interpreter or storage implementation. */
public interface RulePackQuery {
    record Fact(String key, String type, String group, String description, String producedBy) {}

    /** Resolve only shipped or enabled authored packs, never disabled drafts. */
    Optional<RulePack> find(String id);

    /** Required producer capabilities for each resolvable pack. */
    Map<String, Set<String>> requirements(List<String> ids);

    /** Editor metadata may include disabled packs, with their enabled state preserved. */
    List<Map<String, Object>> catalog();

    List<Fact> facts();
}
