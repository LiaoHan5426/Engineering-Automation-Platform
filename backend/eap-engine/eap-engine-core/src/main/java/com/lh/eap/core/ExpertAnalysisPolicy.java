package com.lh.eap.core;

import com.lh.eap.rules.RulePack;
import java.util.*;

/** Domain analysis selected explicitly by the host; the DAG scheduler has no SQL/model implementation dependency. */
public interface ExpertAnalysisPolicy {
    record Rules(List<RulePack> resolved, List<String> missing) {
        public Rules { resolved = List.copyOf(resolved); missing = List.copyOf(missing); }
    }
    record Evidence(String input, String question, Map<String, Object> analysis,
                    List<Map<String, Object>> citations, List<String> advice) {}
    record Enhancement(String advice, String state, Map<String, Object> advisor) {}

    Rules rules(List<String> declaredIds);
    Set<String> allowedFacts();
    Map<String, Object> judge(Map<String, Object> analysis, List<RulePack> rules, Set<String> executedCapabilities);
    List<Map<String, Object>> summarize(List<RulePack> rules);
    /** Model observations must remain unverified and may never turn a failed run into success. */
    Enhancement enhance(Evidence evidence, boolean failed, boolean userRequested);
}
