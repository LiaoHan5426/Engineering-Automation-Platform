package com.lh.eap.web;

import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.SqlFactVocabulary;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Everything a capability handler may read while executing one node.
 *
 * <p>Handlers are shared, stateless beans; all per-run state travels in this record. That is what lets
 * the executor stay a thin scheduler instead of a growing {@code switch} over capability names.
 *
 * <p>{@code facts} is the shared structural evidence base of the whole run. Every capability publishes
 * the facts it is able to produce, and the judgement stage runs <em>after</em> the graph has finished,
 * so a rule can combine facts from several capabilities. A capability that produced nothing
 * contributes nothing — it never silently invents evidence.
 *
 * <p>{@code executionId} identifies the single run this context belongs to. A capability that talks to
 * an external service must key its session on it (see {@link McpCallScope}), because a session that
 * outlives a run would be reused by the next expert that asks for the same tool.
 */
public record CapabilityContext(ExpertManifest.Step step, ExpertExecutionService.Request request,
                                String sql, String question, String expertId, UUID executionId,
                                List<UUID> grants, Map<String, Object> facts, Map<String, Object> analysis,
                                List<String> advice, List<Map<String, Object>> evidence,
                                List<RulePack> rulePacks, Path workspace) {

    /** Facts explicitly produced by a capability that failed or lacked context. */
    public static final String NOT_PRODUCED = "not-produced";

    /**
     * Publishes one structural fact.
     *
     * <p>Only facts declared in {@link SqlFactVocabulary} may be published: an undeclared key would be
     * invisible to rule authors and would silently break the "facts are a published contract" rule, so
     * it is rejected loudly instead.
     */
    public void publish(String fact, Object value) {
        if (!SqlFactVocabulary.FACTS_BY_KEY.containsKey(fact)) {
            throw new IllegalArgumentException("能力发布了未登记的事实：" + fact + "（请先在 SqlFactVocabulary 中声明）");
        }
        facts.put(fact, value);
    }

    /** Records that a capability ran but could not produce its facts (no grant, no input, bad payload). */
    public void markNotProduced(String... factKeys) {
        for (var key : factKeys) publish(key, NOT_PRODUCED);
    }
}
