package com.lh.eap.application.dto;

import java.time.Instant;
import java.util.List;

/** Trusted built-in composition contract and bounded read observations, never grants or execution. */
public record ScenarioWorkflowDependencies(int contractVersion, String workflow, Instant observedAt,
        List<Plugin> plugins, List<Service> services, List<Resource> resources) {
    public record Plugin(String id, boolean required) {}
    public record Service(String id, String state) {}
    public record Resource(String id, boolean required, long count) {}
}
