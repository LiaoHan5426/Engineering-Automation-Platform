package com.lh.eap.application.dto;
import com.lh.eap.application.service.ScenarioDependencyStatus;

import java.util.List;

/** Configuration only: resource labels never grant capabilities or start execution. */
public record ScenarioConfiguration(String name, String status, List<String> modes, String summary,
        String instructions, List<String> tools, List<String> skills, List<String> mcp,
        List<Dependency> dependencies, String workflow) {
    public record Dependency(String name, String state, String where) {
        public Dependency { ScenarioDependencyStatus.fromWire(state); }
    }
    public record Write(Long revision, ScenarioConfiguration definition) {}
    public record Snapshot(String id, long revision, ScenarioConfiguration definition) {}
}
