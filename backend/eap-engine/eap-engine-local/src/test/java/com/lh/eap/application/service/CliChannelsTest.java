package com.lh.eap.application.service;

import com.lh.eap.local.CliChannelStore;
import com.lh.eap.api.Observation;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class CliChannelsTest {
    static class Store implements CliChannelStore {
        final Map<String, String> values = new HashMap<>();
        int writes;
        public Map<String, String> overrides() { return values; }
        public void configure(String program, String binary) {
            writes++;
            if (binary.isBlank()) values.remove(program); else values.put(program, binary);
        }
    }
    @Test void standaloneChannelsHaveNoSpringDatabaseOrWorkflowDependency() {
        for (String type : List.of("org.springframework.context.ApplicationContext", "org.springframework.jdbc.core.JdbcTemplate",
                "com.lh.eap.application.service.CliProgramService")) assertThrows(ClassNotFoundException.class, () -> Class.forName(type));
        var channels = CliChannels.defaults();
        assertEquals("git", channels.binaryFor("git-status", "git"));
        assertThrows(IllegalStateException.class, () -> channels.configure("git", "custom"));
    }
    @Test void bindingsAreLiveSharedByProgramAndClearingCannotReactivateOldOperationKeys() {
        var store = new Store(); var channels = new CliChannels(store);
        store.values.put("git-status", "old-status");
        store.values.put("git-diff", "old-diff");
        assertEquals("git", channels.binaryFor("git-status", "git"));
        channels.configure("git", "new-git");
        assertEquals("new-git", channels.binaryFor("git-status", "git"));
        assertEquals("new-git", channels.binaryFor("git-diff", "git"));
        channels.configure("git", " ");
        assertEquals("git", channels.binaryFor("git-status", "git"));
        assertEquals("git", channels.binaryFor("git-diff", "git"));
        assertEquals("git", channels.binaryFor("git", "git"));
    }
    @Test void invalidBinaryNeverReachesTheStore() {
        var store = new Store(); var channels = new CliChannels(store);
        for (var binary : List.of("--command", "x\ny", "x".repeat(501), "http://host?token=secret"))
            assertThrows(IllegalArgumentException.class, () -> channels.configure("git", binary));
        assertEquals(0, store.writes);
    }
    @Test void unavailableStoreCannotFallBackOrExecuteTheShippedBinary() {
        var calls = new AtomicInteger();
        var store = new CliChannelStore() {
            public Map<String,String> overrides() { throw new IllegalStateException("unavailable"); }
            public void configure(String program,String binary) { fail("unexpected write"); }
        };
        var channels = new CliChannels(store, (capability, cwd, command) -> { calls.incrementAndGet(); return null; });
        assertThrows(IllegalStateException.class, () -> channels.binaryFor("git-status", "git"));
        assertThrows(IllegalStateException.class, () -> channels.probe("git-status", "git", Path.of(".")));
        assertEquals(0, calls.get());
    }
    @Test void explicitProbeUsesAnArgumentArrayAndDoesNotRunWhileResolving() {
        var store = new Store(); var calls = new ArrayList<List<String>>();
        var binary = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
        store.values.put("git", binary);
        var channels = new CliChannels(store, (capability, cwd, command) -> {
            calls.add(List.copyOf(command));
            return new Observation(capability, true, 0, "version " + "x".repeat(700), "", Map.of());
        });
        channels.channel("git-status", "git"); assertTrue(calls.isEmpty());
        var result = channels.probe("git-status", "git", Path.of("."));
        assertEquals(List.of(List.of(binary, "--version")), calls);
        assertEquals(true, result.get("executed"));
        assertTrue(result.get("output").toString().length() <= 501);
    }
}
