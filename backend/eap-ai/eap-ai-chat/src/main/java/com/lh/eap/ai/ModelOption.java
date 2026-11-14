package com.lh.eap.ai;

import java.util.List;

/** Explicitly configured effort values; discovery alone does not establish parameter support. */
public record ModelOption(String id, List<String> reasoningEfforts, boolean supportsImageInput) {
    public ModelOption(String id, List<String> reasoningEfforts) { this(id, reasoningEfforts, false); }
    public ModelOption {
        reasoningEfforts = reasoningEfforts == null ? List.of() : List.copyOf(reasoningEfforts);
    }
}
