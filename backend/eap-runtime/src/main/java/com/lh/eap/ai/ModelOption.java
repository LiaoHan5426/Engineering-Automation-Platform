package com.lh.eap.ai;

import java.util.List;

/** Explicitly configured effort values; discovery alone does not establish parameter support. */
public record ModelOption(String id, List<String> reasoningEfforts) {
    public ModelOption {
        reasoningEfforts = reasoningEfforts == null ? List.of() : List.copyOf(reasoningEfforts);
    }
}
