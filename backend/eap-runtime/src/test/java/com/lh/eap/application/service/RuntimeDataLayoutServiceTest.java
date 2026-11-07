package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class RuntimeDataLayoutServiceTest {
    @TempDir
    Path workspace;

    @Test
    void reportsLogicalPathsWithoutMigrating() throws Exception {
        Files.createDirectories(workspace.resolve(".eap"));
        var runtime = RuntimeWorkspace.colocated(workspace, workspace.toString(), "");
        var service = new RuntimeDataLayoutService(runtime, workspace, ".eap-ai-artifacts", ".eap/model-connections.json");
        var layout = service.layout();
        assertEquals(false, layout.get("physicalMigration"));
        var rawEntries = layout.get("entries");
        assertTrue(rawEntries instanceof java.util.List<?>);
        var entries = (java.util.List<?>) rawEntries;
        assertFalse(entries.isEmpty());
        assertTrue(entries.stream().anyMatch(item -> item instanceof java.util.Map<?, ?> row
                && "workspace/authorized-root".equals(String.valueOf(row.get("logical")))
                && Boolean.TRUE.equals(row.get("exists"))));
    }
}
