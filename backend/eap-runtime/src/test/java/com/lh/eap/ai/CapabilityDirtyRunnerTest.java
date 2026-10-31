package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.lh.eap.api.*;
import com.lh.eap.application.service.CapabilitySettings;
import com.lh.eap.application.service.CliChannels;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.LocalBinaries;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.stereotype.Component;

class CapabilityDirtyRunnerTest {
    @TempDir Path workspace;

    @Test void compatibilityConstructorsNeverStartAnImplicitGitProcess() {
        var runtime = new RuntimeWorkspace(workspace, workspace.toString(), "");
        for (var service : List.of(new CodeChangeService(runtime), new CodeChangeService(runtime, null),
                new CodeChangeService(runtime, null, null))) {
            var result = service.inspectDirty();
            assertFalse(result.requested());
            assertEquals("GIT_STATUS_UNAVAILABLE", result.denial());
        }
    }

    @Test void productionWiringUsesRegisteredCapabilityChannelAndSharedExecutor() throws Exception {
        var settings = mock(CapabilitySettings.class);
        when(settings.enabled("git-status")).thenReturn(true);
        var channels = mock(CliChannels.class);
        String binary = LocalBinaries.resolve("git").orElseThrow().toString();
        when(channels.binaryFor("git-status", "git")).thenReturn(binary);
        var registry = new CapabilityRegistry().register(new GitCapability("status", () -> channels.binaryFor("git-status", "git")));
        var executor = new RecordingExecutor();
        try (var context = context(settings, registry, executor)) {
            var result = context.getBean(CodeChangeService.class).inspectDirty();
            assertTrue(result.requested(), result.detail());
            assertEquals(List.of("src/App.vue"), result.paths());
            assertEquals(3, executor.commands.size());
            assertTrue(executor.commands.stream().allMatch(command -> command.getFirst().equals(binary)));
            assertTrue(executor.commands.getLast().contains("--porcelain=v1"));
            assertTrue(executor.commands.getLast().contains("core.fsmonitor=false"));
            verify(settings).enabled("git-status");
            verify(channels, atLeastOnce()).binaryFor("git-status", "git");
        }
    }

    @Test void dirtyOutputIsBoundedAndRedactedBeforeReturningPaths() throws Exception {
        var settings = mock(CapabilitySettings.class);
        when(settings.enabled("git-status")).thenReturn(true);
        var registry = new CapabilityRegistry().register(new GitCapability("status"));
        var executor = new RecordingExecutor();
        var runner = new CapabilityDirtyRunner(settings, registry, executor);
        executor.statusOutput = "?? token=synthetic-sensitive-value.txt\n";
        assertFalse(runner.porcelain(workspace).contains("synthetic-sensitive-value"));
        executor.statusOutput = " M " + "x".repeat(32768);
        assertEquals("GIT_STATUS_TRUNCATED", assertThrows(java.io.IOException.class, () -> runner.porcelain(workspace)).getMessage());
    }

    @Test void disabledOrUnavailableSettingsNeverReachExecutor() {
        var disabled = mock(CapabilitySettings.class);
        for (var settings : List.of(disabled, new CapabilitySettings(null, null))) {
            var executor = mock(ProcessExecutor.class);
            var registry = new CapabilityRegistry().register(new GitCapability("status"));
            var service = new CodeChangeService(new RuntimeWorkspace(workspace, workspace.toString(), ""), null,
                    new CapabilityDirtyRunner(settings, registry, executor));
            assertFalse(service.inspectDirty().requested());
            verifyNoInteractions(executor);
        }
    }

    @Test void missingBinaryAndUnauthorizedRootNeverReachExecutor() {
        var settings = mock(CapabilitySettings.class);
        when(settings.enabled("git-status")).thenReturn(true);
        var executor = mock(ProcessExecutor.class);
        var registry = new CapabilityRegistry().register(new GitCapability("status", () -> workspace.resolve("missing-git.exe").toString()));
        var runner = new CapabilityDirtyRunner(settings, registry, executor);
        assertEquals("BINARY_MISSING", assertThrows(java.io.IOException.class, () -> runner.porcelain(workspace)).getMessage());
        clearInvocations(settings);
        assertEquals("AUTHORIZED_ROOT_MISSING", new CodeChangeService(new RuntimeWorkspace(workspace, "", ""), null, runner).inspectDirty().denial());
        verifyNoInteractions(executor, settings);
    }

    @Test void failedUnknownIncompleteOrTruncatedStatusIsNeverReportedClean() {
        var settings = mock(CapabilitySettings.class);
        when(settings.enabled("git-status")).thenReturn(true);
        var registry = new CapabilityRegistry().register(new GitCapability("status"));
        var executor = new RecordingExecutor();
        var service = new CodeChangeService(new RuntimeWorkspace(workspace, workspace.toString(), ""), null,
                new CapabilityDirtyRunner(settings, registry, executor));
        for (var metadata : List.of(
                Map.<String, Object>of("executorStatus", "TIMED_OUT", "processExited", true, "processTreeCleanup", true),
                Map.<String, Object>of("executorStatus", "FAILED", "processExited", true, "processTreeCleanup", true),
                Map.<String, Object>of("executorStatus", "UNKNOWN", "processExited", true, "processTreeCleanup", true),
                Map.<String, Object>of("executorStatus", "SUCCEEDED", "processExited", true, "processTreeCleanup", false),
                Map.<String, Object>of("executorStatus", "SUCCEEDED", "processExited", true, "processTreeCleanup", true, "truncated", true))) {
            executor.statusResult = new Observation("git-status", true, 0, "", "", metadata);
            var result = service.inspectDirty();
            assertFalse(result.requested(), metadata.toString());
            assertEquals("GIT_STATUS_FAILED", result.denial());
            assertNotEquals("clean", result.detail());
        }
    }

    private AnnotationConfigApplicationContext context(CapabilitySettings settings, CapabilityRegistry registry, ProcessExecutor executor) throws Exception {
        var scanner = new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter((reader, factory) -> reader.getAnnotationMetadata().hasAnnotation(Component.class.getName())
                && Arrays.asList(reader.getClassMetadata().getInterfaceNames()).contains(CodeChangeService.DirtyRunner.class.getName()));
        var candidates = scanner.findCandidateComponents("com.lh.eap.ai");
        assertEquals(1, candidates.size(), "Dirty inspection must have one injectable capability-backed runner");
        var context = new AnnotationConfigApplicationContext();
        context.registerBean(RuntimeWorkspace.class, () -> new RuntimeWorkspace(workspace, workspace.toString(), ""));
        context.registerBean(CapabilitySettings.class, () -> settings);
        context.registerBean(CapabilityRegistry.class, () -> registry);
        context.registerBean(ProcessExecutor.class, () -> executor);
        context.register(CodeChangeService.class, Class.forName(candidates.iterator().next().getBeanClassName()));
        context.refresh();
        return context;
    }

    private final class RecordingExecutor implements ProcessExecutor {
        final List<List<String>> commands = new ArrayList<>();
        String statusOutput = " M src/App.vue\n";
        Observation statusResult;
        @Override public Observation run(String capability, Path directory, List<String> command) {
            throw new AssertionError("Dirty inspection must use isolated environment execution");
        }
        @Override public Observation runIsolated(String capability, Path directory, List<String> command, Map<String, String> environment) {
            assertEquals(workspace, directory);
            assertEquals("0", environment.get("GIT_OPTIONAL_LOCKS"));
            commands.add(command);
            if (command.contains("status") && statusResult != null) return statusResult;
            String output = command.contains("--show-toplevel") ? workspace.toString() : command.contains("config") ? "" : statusOutput;
            return new Observation(capability, true, 0, output, "", Map.of("executorStatus", "SUCCEEDED", "processExited", true, "processTreeCleanup", true));
        }
    }
}
