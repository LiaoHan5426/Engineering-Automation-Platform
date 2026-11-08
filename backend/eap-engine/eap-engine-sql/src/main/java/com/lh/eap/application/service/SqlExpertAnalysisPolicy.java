package com.lh.eap.application.service;

import com.lh.eap.core.ExpertAnalysisPolicy;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.llm.PromptPreprocessor;
import com.lh.eap.rules.*;
import com.lh.eap.runtime.sql.DeterministicSqlAnalyzer;
import java.util.*;
import org.springframework.stereotype.Service;

/** Preserves the SQL product's rule, fact and optional model semantics behind the scheduler's analysis port. */
@Service
public class SqlExpertAnalysisPolicy implements ExpertAnalysisPolicy {
    private final RulePackService rulePacks;
    private final SqlExpertService model;

    public SqlExpertAnalysisPolicy(RulePackService rulePacks, SqlExpertService model) {
        this.rulePacks = rulePacks;
        this.model = model;
    }
    @Override public Rules rules(List<String> declaredIds) {
        return new Rules(rulePacks.resolve(declaredIds), rulePacks.unresolved(declaredIds));
    }
    @Override public Set<String> allowedFacts() { return SqlFactVocabulary.FACTS_BY_KEY.keySet(); }
    @Override public Map<String, Object> judge(Map<String, Object> analysis, List<RulePack> rules, Set<String> executed) {
        return DeterministicSqlAnalyzer.judge(analysis, rules, executed);
    }
    @Override public List<Map<String, Object>> summarize(List<RulePack> rules) {
        var summary = new ArrayList<Map<String, Object>>();
        for (var pack : rules) summary.add(Map.of("id", pack.id(), "name", Objects.toString(pack.name(), pack.id()),
                "ruleCount", pack.rules() == null ? 0 : pack.rules().size(),
                "requires", List.copyOf(RulePacks.requiredCapabilities(pack))));
        return summary;
    }
    @Override public Enhancement enhance(Evidence evidence, boolean failed, boolean userRequested) {
        SqlExpertService.Outcome outcome = null;
        if (!failed && "valid".equals(evidence.analysis().get("parseStatus"))) {
            var prepared = new PromptPreprocessor.SqlEvidence(evidence.input(), evidence.question(), evidence.analysis(),
                    evidence.citations(), List.copyOf(evidence.advice()),
                    List.of("不得泄露凭据；不得自动执行 SQL；候选改写必须保持原查询语义，模型建议未通过语义或性能验证"));
            outcome = model.advise(prepared, userRequested);
        }
        String advice = outcome != null && outcome.succeeded() ? SensitiveData.redact(outcome.text()) : null;
        String state = outcome == null ? "unavailable" : advice != null ? "unverified-observation"
                : outcome.attempted() || !outcome.error().isEmpty() ? "unavailable" : "skipped";
        return new Enhancement(advice, state, SqlExpertService.toResponse(outcome));
    }
}
