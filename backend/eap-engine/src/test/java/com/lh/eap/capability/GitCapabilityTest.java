package com.lh.eap.capability;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.api.ExecutionContext;
import com.lh.eap.api.Observation;
import com.lh.eap.api.ProcessExecutor;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class GitCapabilityTest {
    @TempDir Path workspace;
    @Test
    void managedExecutionUsesTheCapabilityCommandAndThePlatformId() {
        var recorder = new RecordingExecutor();
        var capability = new GitCapability("status");
        assertEquals(List.of("git", "--no-pager", "-c", "core.quotePath=true", "-c", "color.ui=false", "-c", "core.fsmonitor=false",
                "status", "--ignore-submodules=all", "--untracked-files=normal"), capability.command());
        var id = UUID.randomUUID();
        org.junit.jupiter.api.Assumptions.assumeTrue(capability.runnable());
        assertTrue(capability.executeManaged(id, new ExecutionContext(workspace, recorder)).success());
        assertEquals(id, recorder.id);
        assertEquals(capability.command(), recorder.command);
        assertEquals("0", recorder.environment.get("GIT_OPTIONAL_LOCKS"));
                assertEquals("0", recorder.environment.get("GIT_TERMINAL_PROMPT"));
                assertEquals(2, recorder.isolatedCalls);
        assertFalse(recorder.environment.containsKey("GIT_ASKPASS"));
        assertEquals(0, recorder.runCalls);
    }

    @ParameterizedTest
    @CsvSource({"root,TIMED_OUT,false,124", "filters,TIMED_OUT,false,124", "root,FAILED,false,128",
            "filters,FAILED,false,128", "root,UNKNOWN,false,-1", "filters,UNKNOWN,false,1",
            "root,UNKNOWN,true,0", "filters,UNKNOWN,true,0", "root,CANCELLED,false,130", "filters,CANCELLED,false,130"})
    void preflightFailurePreservesProcessEvidenceAndNeverRunsInspection(String step, String status, boolean success, int exitCode) {
        var recorder = new RecordingExecutor();
        recorder.failureStep = step;
        recorder.failure = new Observation("git-status", success, exitCode, step.equals("root") ? workspace.toString() : "", "",
                Map.of("executorStatus", status, "processExited", true, "processTreeCleanup", true, "processNotStarted", false, "processPid", 456L));
        var capability = new GitCapability("status");
        for (boolean managed : List.of(false, true)) {
            recorder.isolatedCalls = 0;
            var context = new ExecutionContext(workspace, recorder);
            var result = managed ? capability.executeManaged(UUID.randomUUID(), context) : capability.execute(context);
            assertFalse(result.success(), "Unknown executor state cannot authorize inspection");
            assertEquals(status, result.metadata().get("executorStatus"));
            assertEquals(false, result.metadata().get("processNotStarted"));
            assertEquals(true, result.metadata().get("processExited"));
            assertEquals(456L, result.metadata().get("processPid"));
            assertEquals(exitCode, result.exitCode());
            assertEquals(step.equals("root") ? 1 : 2, recorder.isolatedCalls);
            assertNull(recorder.id);
        }
    }

    @Test void rootPolicyRejectionDoesNotClaimNoProcessStarted() {
        var recorder = new RecordingExecutor();
        recorder.failureStep = "root";
        recorder.failure = new Observation("git-status", true, 0, workspace.getParent().toString(), "",
                Map.of("executorStatus", "SUCCEEDED", "processExited", true, "processTreeCleanup", true, "processNotStarted", false));
        var result = new GitCapability("status").execute(new ExecutionContext(workspace, recorder));
        assertFalse(result.success());
        assertEquals("REPOSITORY_ROOT_MISMATCH", result.stderr());
        assertEquals("FAILED", result.metadata().get("executorStatus"));
        assertEquals(true, result.metadata().get("processExited"));
        assertEquals(false, result.metadata().get("processNotStarted"));
        assertEquals(1, recorder.isolatedCalls);
    }

    private final class RecordingExecutor implements ProcessExecutor {
        UUID id;
        List<String> command;
        Map<String, String> environment;
        int runCalls;
        int isolatedCalls;
        String failureStep;
        Observation failure;

        @Override public Observation runIsolated(String capability, Path directory, List<String> command, Map<String, String> environment) {
            isolatedCalls++;
            String step = command.contains("--show-toplevel") ? "root" : command.contains("config") ? "filters" : "status";
            if (step.equals(failureStep)) return failure;
            if (step.equals("filters")) return new Observation(capability, false, 1, "", "",
                    Map.of("executorStatus", "FAILED", "processExited", true, "processTreeCleanup", true));
            return new Observation(capability, true, 0, step.equals("root") ? workspace.toString() : "", "",
                    Map.of("executorStatus", "SUCCEEDED", "processExited", true, "processTreeCleanup", true));
        }

        @Override
        public Observation run(String capability, Path workingDirectory, List<String> command) {
            runCalls++;
            throw new AssertionError("managed git must not use the hidden-id run path");
        }

        @Override
        public Observation runManaged(UUID id, String capability, Path directory, List<String> command, Map<String, String> environment) {
            this.id = id;
            this.command = command;
            this.environment = environment;
            return new Observation(capability, true, 0, "", "", Map.of("executorStatus", "SUCCEEDED", "processExited", true, "processTreeCleanup", true));
        }
    }
}
