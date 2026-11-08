package com.lh.eap.decision;

/**
 * A small, typed decision layer used for routing and triage. It returns a constrained choice with
 * a confidence and a rationale — never generated code — so it can be swap-optimized (local rules,
 * a fast classifier) without gaining authority over the final validation gate.
 */
public interface DecisionProvider {
    Decision decide(Request request);

    /** A routing decision request. {@code kind} selects the decision policy, {@code features} are typed inputs. */
    record Request(String kind, java.util.Map<String, Object> features) { }

    /** A constrained decision. {@code choice} is policy-defined, e.g. {@code enhance} or {@code skip}. */
    record Decision(String choice, double confidence, String rationale) {
        public boolean is(String candidate) {
            return choice != null && choice.equals(candidate);
        }
    }
}
