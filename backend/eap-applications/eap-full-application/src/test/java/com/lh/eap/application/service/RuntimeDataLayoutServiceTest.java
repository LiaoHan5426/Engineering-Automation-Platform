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
        assertTrue(entries.stream().anyMatch(item -> item instanceof java.util.Map<?, ?> row
                && "cache/trusted-tool-probes".equals(String.valueOf(row.get("logical")))));

        var readiness = layout.get("migrationReadiness");
        assertTrue(readiness instanceof java.util.Map<?, ?>);
        var readinessMap = (java.util.Map<?, ?>) readiness;
        assertEquals(false, readinessMap.get("physicalMigration"));
        assertEquals(false, readinessMap.get("approved"));
        assertTrue(readinessMap.get("candidates") instanceof java.util.List<?>);
        var counts = (java.util.Map<?, ?>) readinessMap.get("candidateCounts");
        assertNotNull(counts);
        assertEquals(
                ((Number) counts.get("present")).intValue() + ((Number) counts.get("absent")).intValue(),
                ((Number) counts.get("total")).intValue());
    }

    @Test
    void reportsCandidatesPresentWhenLegacyArtifactsExist() throws Exception {
        Files.createDirectories(workspace.resolve(".eap-ai-artifacts"));
        var runtime = RuntimeWorkspace.colocated(workspace, workspace.toString(), "");
        var service = new RuntimeDataLayoutService(runtime, workspace, ".eap-ai-artifacts", ".eap/model-connections.json");
        var readiness = (java.util.Map<?, ?>) service.layout().get("migrationReadiness");
        assertEquals("candidates_present", readiness.get("status"));
        var candidates = (java.util.List<?>) readiness.get("candidates");
        assertTrue(candidates.stream().anyMatch(item -> item instanceof java.util.Map<?, ?> row
                && "legacy-ai-artifacts".equals(String.valueOf(row.get("id")))
                && Boolean.TRUE.equals(row.get("present"))));
    }

    @Test
    void reportsInventoryCountsWithoutScanning() throws Exception {
        Files.createDirectories(workspace.resolve(".eap"));
        var runtime = RuntimeWorkspace.colocated(workspace, workspace.toString(), "");
        var service = new RuntimeDataLayoutService(runtime, workspace, ".eap-ai-artifacts", ".eap/model-connections.json");
        var inventory = (java.util.Map<?, ?>) service.layout().get("inventory");
        assertNotNull(inventory);
        var entries = (java.util.List<?>) service.layout().get("entries");
        assertEquals(entries.size(), ((Number) inventory.get("total")).intValue());
        assertEquals(
                ((Number) inventory.get("present")).intValue() + ((Number) inventory.get("missing")).intValue(),
                ((Number) inventory.get("total")).intValue());
        assertTrue(((Number) inventory.get("present")).intValue() >= 2);
        assertTrue(((Number) inventory.get("missing")).intValue() >= 1);
        var byKind = (java.util.Map<?, ?>) inventory.get("byKind");
        assertNotNull(byKind);
        assertEquals(
                ((Number) byKind.get("file")).intValue()
                        + ((Number) byKind.get("directory")).intValue()
                        + ((Number) byKind.get("missing")).intValue()
                        + ((Number) byKind.get("other")).intValue(),
                ((Number) inventory.get("total")).intValue());
        assertTrue(((Number) byKind.get("directory")).intValue() >= 1);
        assertTrue(((Number) byKind.get("missing")).intValue() >= 1);
    }

    @Test
    void reportsKindAndByteSizeForProbeCacheFileWithoutScanning() throws Exception {
        var probe = workspace.resolve(".eap").resolve("cache").resolve("trusted-tool-probes.json");
        Files.createDirectories(probe.getParent());
        Files.writeString(probe, "{\"schema\":\"trusted-tool-probes/v1\",\"probes\":{}}");
        var runtime = RuntimeWorkspace.colocated(workspace, workspace.toString(), "");
        var service = new RuntimeDataLayoutService(runtime, workspace, ".eap-ai-artifacts", ".eap/model-connections.json");
        var entries = (java.util.List<?>) service.layout().get("entries");
        var probeRow = entries.stream()
                .filter(item -> item instanceof java.util.Map<?, ?> row
                        && "cache/trusted-tool-probes".equals(String.valueOf(row.get("logical"))))
                .map(item -> (java.util.Map<?, ?>) item)
                .findFirst()
                .orElseThrow();
        assertEquals("file", probeRow.get("kind"));
        assertTrue(((Number) probeRow.get("byteSize")).longValue() > 0);
        var cacheRow = entries.stream()
                .filter(item -> item instanceof java.util.Map<?, ?> row
                        && "cache".equals(String.valueOf(row.get("logical"))))
                .map(item -> (java.util.Map<?, ?>) item)
                .findFirst()
                .orElseThrow();
        assertEquals("directory", cacheRow.get("kind"));
        assertFalse(cacheRow.containsKey("byteSize"));
    }
}
