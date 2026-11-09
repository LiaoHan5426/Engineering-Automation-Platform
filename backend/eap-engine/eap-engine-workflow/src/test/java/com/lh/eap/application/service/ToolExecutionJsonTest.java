package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class ToolExecutionJsonTest {
    @Test void durableSnapshotRoundTripsTimeAndStepEvidence() {
        var id = UUID.randomUUID();
        var row = new ToolExecution(id, UUID.randomUUID(), "git", "git-status", "/workspace", "/bin/git", "CANCELLED", true,
                Instant.now(), Instant.now(), 130, "", "", false, "tree cleaned", null,
                List.of(new ToolExecution.Step(UUID.randomUUID(), "root", "CANCELLED", List.of("git", "rev-parse"), Map.of("processPid", 42L, "processTreeCleanup", true))));
        var json = JsonMapper.builder().build();
        var restored = json.readValue(json.writeValueAsString(row), ToolExecution.class);
        assertEquals(id, restored.id()); assertEquals(row.createdAt(), restored.createdAt());
        assertEquals(row.finishedAt(), restored.finishedAt());
        assertEquals(true, restored.steps().getFirst().evidence().get("processTreeCleanup"));
        assertEquals(42L, ((Number) restored.steps().getFirst().evidence().get("processPid")).longValue());
    }
}
