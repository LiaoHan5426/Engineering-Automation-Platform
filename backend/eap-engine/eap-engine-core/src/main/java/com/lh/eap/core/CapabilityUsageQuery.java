package com.lh.eap.core;

import java.util.*;

/** Reference lookup used to protect capabilities still in use. */
public interface CapabilityUsageQuery {
    /** @param usedBy enabled experts; @param declaredBy every expert including drafts */
    public record Usage(Map<String, List<String>> usedBy, Map<String, List<String>> declaredBy) {
        public List<String> enabledFor(String capability) { return usedBy.getOrDefault(capability, List.of()); }
        public List<String> declaredFor(String capability) { return declaredBy.getOrDefault(capability, List.of()); }
    }

    Usage usage();
    List<String> enabledExpertsUsing(String capability);
}
