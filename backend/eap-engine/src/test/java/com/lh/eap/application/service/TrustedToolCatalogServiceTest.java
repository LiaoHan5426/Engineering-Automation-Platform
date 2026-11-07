package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.lh.eap.domain.model.CapabilityDescriptor;
import com.lh.eap.domain.model.CapabilityKind;
import com.lh.eap.domain.model.CapabilityScope;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

class TrustedToolCatalogServiceTest {

    @Test
    @SuppressWarnings("unchecked")
    void catalogSurfacesDisabledConflictAndUnknownVersionBindings() {
        var catalog = new TrustedToolCatalogService(registry(), settings(), channels()).catalog();
        assertEquals("capability-handlers", catalog.get("source"));
        var items = (List<Map<String, Object>>) catalog.get("items");
        assertEquals(3, items.size());

        var status = items.stream().filter(row -> "git-status".equals(row.get("id"))).findFirst().orElseThrow();
        assertEquals("ready", status.get("bindingStatus"));
        assertEquals("unknown", status.get("versionStatus"));
        assertEquals("shipped", status.get("bindingSource"));

        var stopped = items.stream().filter(row -> "git-diff".equals(row.get("id"))).findFirst().orElseThrow();
        assertEquals("disabled", stopped.get("bindingStatus"));
        assertTrue(String.valueOf(stopped.get("bindingNote")).contains("停用"));

        var broken = items.stream().filter(row -> "broken-cli".equals(row.get("id"))).findFirst().orElseThrow();
        assertEquals("conflict", broken.get("bindingStatus"));
        assertEquals("operator", broken.get("bindingSource"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void explicitProbeWritesKnownVersionBackIntoCatalog() {
        var channels = channels();
        when(channels.probe(eq("git-status"), eq("git"), any(Path.class))).thenReturn(probeOk("git version 2.45.1"));

        var service = new TrustedToolCatalogService(registry(), settings(), channels);
        var result = service.probeVersion("git-status");
        assertEquals("known", result.get("versionStatus"));
        assertEquals("git version 2.45.1", result.get("detectedVersion"));
        assertEquals(true, result.get("success"));

        var items = (List<Map<String, Object>>) service.catalog().get("items");
        var status = items.stream().filter(row -> "git-status".equals(row.get("id"))).findFirst().orElseThrow();
        assertEquals("known", status.get("versionStatus"));
        assertEquals("git version 2.45.1", status.get("detectedVersion"));
        assertFalse(String.valueOf(status.get("probedAt")).isBlank());
        assertTrue(String.valueOf(status.get("bindingNote")).contains("显式探测"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void failedProbeWritesProbeFailedWithoutInventingVersion() {
        var channels = channels();
        when(channels.probe(eq("git-status"), eq("git"), any(Path.class))).thenReturn(probeFail("exit 1"));

        var service = new TrustedToolCatalogService(registry(), settings(), channels);
        var result = service.probeVersion("git-status");
        assertEquals("probe_failed", result.get("versionStatus"));
        assertEquals("", result.get("detectedVersion"));
        assertEquals(false, result.get("success"));

        var items = (List<Map<String, Object>>) service.catalog().get("items");
        var status = items.stream().filter(row -> "git-status".equals(row.get("id"))).findFirst().orElseThrow();
        assertEquals("probe_failed", status.get("versionStatus"));
        assertEquals("", status.get("detectedVersion"));
    }

    @Test
    void probeRejectsDisabledAndConflictBindings() {
        var service = new TrustedToolCatalogService(registry(), settings(), channels());
        var disabled = assertThrows(ResponseStatusException.class, () -> service.probeVersion("git-diff"));
        assertEquals(403, disabled.getStatusCode().value());

        var conflict = assertThrows(ResponseStatusException.class, () -> service.probeVersion("broken-cli"));
        assertEquals(409, conflict.getStatusCode().value());
    }

    @Test
    @SuppressWarnings("unchecked")
    void durableProbeSurvivesCatalogReconstruction(@TempDir Path workspace) {
        var store = TrustedToolProbeStore.underWorkspace(workspace);
        var channels = channels();
        when(channels.probe(eq("git-status"), eq("git"), any(Path.class))).thenReturn(probeOk("git version 2.45.1"));

        var first = new TrustedToolCatalogService(registry(), settings(), channels, store);
        first.probeVersion("git-status");
        assertTrue(Files.isRegularFile(store.file()));

        var second = new TrustedToolCatalogService(registry(), settings(), channels, store);
        var items = (List<Map<String, Object>>) second.catalog().get("items");
        var status = items.stream().filter(row -> "git-status".equals(row.get("id"))).findFirst().orElseThrow();
        assertEquals("known", status.get("versionStatus"));
        assertEquals("git version 2.45.1", status.get("detectedVersion"));
        assertTrue(String.valueOf(status.get("bindingNote")).contains("持久化"));

        var cleared = second.clearProbeCache();
        assertEquals(1, cleared.get("cleared"));
        assertEquals(0, cleared.get("remaining"));
        var third = new TrustedToolCatalogService(registry(), settings(), channels, store);
        var afterClear = (List<Map<String, Object>>) third.catalog().get("items");
        var unknown = afterClear.stream().filter(row -> "git-status".equals(row.get("id"))).findFirst().orElseThrow();
        assertEquals("unknown", unknown.get("versionStatus"));
        assertEquals("", unknown.get("detectedVersion"));
    }

    private static CapabilityHandlerRegistry registry() {
        var ready = mock(CapabilityHandler.class);
        when(ready.scope()).thenReturn(CapabilityScope.PLATFORM);
        when(ready.describe()).thenReturn(List.of(cli("git-status", "git")));

        var disabled = mock(CapabilityHandler.class);
        when(disabled.scope()).thenReturn(CapabilityScope.PLATFORM);
        when(disabled.describe()).thenReturn(List.of(cli("git-diff", "git")));

        var conflict = mock(CapabilityHandler.class);
        when(conflict.scope()).thenReturn(CapabilityScope.PLATFORM);
        when(conflict.describe()).thenReturn(List.of(cli("broken-cli", "git")));

        var registry = mock(CapabilityHandlerRegistry.class);
        when(registry.all()).thenReturn(List.of(ready, disabled, conflict));
        return registry;
    }

    private static CapabilitySettings settings() {
        var settings = mock(CapabilitySettings.class);
        when(settings.enabled("git-status")).thenReturn(true);
        when(settings.enabled("git-diff")).thenReturn(false);
        when(settings.enabled("broken-cli")).thenReturn(true);
        return settings;
    }

    private static CliChannels channels() {
        var channels = mock(CliChannels.class);
        when(channels.channel("git-status", "git")).thenReturn(
                new CliChannels.Channel("git-status", "git", "shipped", "/usr/bin/git",
                        com.lh.eap.domain.model.CapabilityAvailability.AVAILABLE));
        when(channels.channel("git-diff", "git")).thenReturn(
                new CliChannels.Channel("git-diff", "git", "shipped", "/usr/bin/git",
                        com.lh.eap.domain.model.CapabilityAvailability.AVAILABLE));
        when(channels.channel("broken-cli", "git")).thenReturn(
                new CliChannels.Channel("broken-cli", "/missing/git", "operator", null,
                        com.lh.eap.domain.model.CapabilityAvailability.MISSING_BINARY));
        return channels;
    }

    private static Map<String, Object> probeOk(String output) {
        var row = new LinkedHashMap<String, Object>();
        row.put("executed", true);
        row.put("success", true);
        row.put("output", output);
        row.put("message", "探测成功");
        return row;
    }

    private static Map<String, Object> probeFail(String message) {
        var row = new LinkedHashMap<String, Object>();
        row.put("executed", true);
        row.put("success", false);
        row.put("output", "");
        row.put("message", message);
        return row;
    }

    private static CapabilityDescriptor cli(String name, String binary) {
        return new CapabilityDescriptor(name, CapabilityKind.CLI, name, "summary",
                List.of(), List.of(), "ProcessExecutor", binary, List.of(), List.of(), true);
    }
}
