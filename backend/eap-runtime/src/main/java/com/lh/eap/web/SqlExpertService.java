package com.lh.eap.web;

import com.lh.eap.decision.DecisionProvider;
import com.lh.eap.decision.RuleBasedDecisionProvider;
import com.lh.eap.llm.LlmGateway;
import com.lh.eap.llm.LlmProvider;
import com.lh.eap.llm.PromptPreprocessor;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * The model advisor for the SQL expert.
 *
 * <p>It is intentionally a thin orchestration layer: the {@link DecisionProvider} decides whether a
 * model is worth calling at all, the {@link PromptPreprocessor} compresses the deterministic evidence
 * into a token-bounded prompt, and the {@link LlmGateway} performs a cached, fail-closed call. When
 * any stage declines, the deterministic result is returned unchanged and the reason is reported.
 *
 * <p>Model output is always an unverified observation; it never mutates the deterministic analysis
 * and never marks a task complete.
 */
@Service
public class SqlExpertService {
    private static final Logger log = LoggerFactory.getLogger(SqlExpertService.class);

    private final PromptPreprocessor preprocessor;
    private final LlmGateway gateway;
    private final DecisionProvider decisions;
    private final double temperature;
    private final int maxTokens;

    public SqlExpertService(PromptPreprocessor preprocessor, LlmGateway gateway, DecisionProvider decisions,
                            @Value("${eap.llm.temperature:0.1}") double temperature,
                            @Value("${eap.llm.max-completion-tokens:700}") int maxTokens) {
        this.preprocessor = preprocessor;
        this.gateway = gateway;
        this.decisions = decisions;
        this.temperature = temperature;
        this.maxTokens = maxTokens;
    }

    /** The routing + preprocessing + call outcome, always present so the caller can audit the decision. */
    public record Outcome(boolean attempted, boolean succeeded, String decision, String rationale,
                          String text, String provider, String model, long latencyMs,
                          int promptTokens, int completionTokens, Map<String, Object> preprocessing) { }

    public Outcome advise(PromptPreprocessor.SqlEvidence evidence, boolean userRequested) {
        var analysis = evidence.analysis() == null ? Map.<String, Object>of() : evidence.analysis();
        var decision = decisions.decide(new DecisionProvider.Request(
                RuleBasedDecisionProvider.KIND_SQL_ENHANCE,
                Map.of(
                        "parseStatus", String.valueOf(analysis.getOrDefault("parseStatus", "invalid")),
                        "requiresModelReview", Boolean.TRUE.equals(analysis.get("requiresModelReview")),
                        "deterministicConfidence", analysis.getOrDefault("deterministicConfidence", 0.5),
                        "userRequested", userRequested)));

        var prepared = preprocessor.prepare(evidence);
        var preprocessing = preprocessor.describe(prepared);

        if (!decision.is(RuleBasedDecisionProvider.CHOICE_ENHANCE)) {
            return new Outcome(false, false, decision.choice(), decision.rationale(),
                    null, null, null, 0, 0, 0, preprocessing);
        }
        if (!gateway.available()) {
            return new Outcome(false, false, decision.choice(),
                    decision.rationale() + "；但当前没有已启用且通过端点策略的模型，已回退确定性结果",
                    null, null, null, 0, 0, 0, preprocessing);
        }

        var activeProvider = gateway.activeProviderId().orElse(null);
        var request = new LlmProvider.Request(prepared.systemPrompt(), prepared.userPrompt(), temperature, maxTokens, null);
        var result = gateway.complete(request);
        if (result.isEmpty()) {
            return new Outcome(true, false, decision.choice(), decision.rationale() + "；模型调用失败，已回退确定性结果",
                    null, activeProvider, null, 0, 0, 0, preprocessing);
        }
        var response = result.get();
        log.info("SQL model advice produced: provider={}, estimatedTokens={}, baselineTokens={}",
                response.providerId(), prepared.estimatedTokens(), prepared.baselineTokens());
        return new Outcome(true, true, decision.choice(), decision.rationale(),
                response.text(), response.providerId(), response.model(), response.latencyMs(),
                response.promptTokens(), response.completionTokens(), preprocessing);
    }

    /** A stable, ordered view for the API response. */
    public static Map<String, Object> toResponse(Outcome outcome) {
        var map = new LinkedHashMap<String, Object>();
        if (outcome == null) {
            map.put("decision", "unavailable");
            map.put("rationale", "模型顾问未运行");
            return map;
        }
        map.put("attempted", outcome.attempted());
        map.put("succeeded", outcome.succeeded());
        map.put("decision", outcome.decision());
        map.put("rationale", outcome.rationale());
        map.put("provider", outcome.provider());
        map.put("model", outcome.model());
        map.put("latencyMs", outcome.latencyMs());
        map.put("promptTokens", outcome.promptTokens());
        map.put("completionTokens", outcome.completionTokens());
        map.put("preprocessing", outcome.preprocessing());
        return map;
    }

    public Optional<String> providerId() {
        return gateway.activeProviderId();
    }
}
