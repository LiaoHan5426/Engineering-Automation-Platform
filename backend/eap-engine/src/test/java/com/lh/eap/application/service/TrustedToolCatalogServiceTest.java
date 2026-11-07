package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.lh.eap.domain.model.CapabilityDescriptor;
import com.lh.eap.domain.model.CapabilityKind;
import com.lh.eap.domain.model.CapabilityScope;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class TrustedToolCatalogServiceTest {

    @Test
    @SuppressWarnings("unchecked")
    void catalogSurfacesDisabledConflictAndUnknownVersionBindings() {
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

        var settings = mock(CapabilitySettings.class);
        when(settings.enabled("git-status")).thenReturn(true);
        when(settings.enabled("git-diff")).thenReturn(false);
        when(settings.enabled("broken-cli")).thenReturn(true);

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

        var catalog = new TrustedToolCatalogService(registry, settings, channels).catalog();
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

    private static CapabilityDescriptor cli(String name, String binary) {
        return new CapabilityDescriptor(name, CapabilityKind.CLI, name, "summary",
                List.of(), List.of(), "ProcessExecutor", binary, List.of(), List.of(), true);
    }
}
