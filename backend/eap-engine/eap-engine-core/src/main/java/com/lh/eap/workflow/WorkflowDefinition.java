package com.lh.eap.workflow;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Fixed capability workflow; contains no expert identity, resource grants or domain analysis policy. */
public record WorkflowDefinition(List<Step> steps, List<Edge> edges) {
    public record Step(String id, String label, String capability, Boolean required) {}
    public record Edge(String source, String target) {}

    public WorkflowDefinition {
        // Preserve invalid/null input for validation, while preventing changes during execution.
        steps = steps == null ? null : Collections.unmodifiableList(new ArrayList<>(steps));
        edges = edges == null ? null : Collections.unmodifiableList(new ArrayList<>(edges));
    }
}
