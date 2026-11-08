package com.lh.eap.domain.model;

import java.util.List;

/** Professional goal and permitted tools; neither a workflow nor a grant. */
public record ExpertAgentDefinition(String goal, List<String> tools) {
    public ExpertAgentDefinition {
        if (goal == null || goal.isBlank() || goal.length() > 2000 || tools == null || tools.isEmpty()
                || tools.size() > 16 || tools.stream().anyMatch(t -> t == null || t.isBlank())
                || tools.stream().distinct().count() != tools.size()) {
            throw new IllegalArgumentException("Invalid expert agent definition");
        }
        tools = List.copyOf(tools);
    }
}
