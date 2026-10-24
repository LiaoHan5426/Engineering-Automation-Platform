package com.lh.eap.capability;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lh.eap.api.ExecutionContext;
import com.lh.eap.api.Observation;
import com.lh.eap.api.ProcessExecutor;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class GitCapabilityTest {
    @Test
    void managedExecutionUsesTheCapabilityCommandAndThePlatformId() {
        var recorder = new RecordingExecutor();
        var capability = new GitCapability("status");
        assertEquals(List.of("git", "status"), capability.command());
        var id = UUID.randomUUID();
        org.junit.jupiter.api.Assumptions.assumeTrue(capability.runnable());
        capability.executeManaged(id, new ExecutionContext(Path.of("."), recorder));
        assertEquals(id, recorder.id);
        assertEquals(capability.command(), recorder.command);
        assertTrue(recorder.environment.keySet().stream().allMatch(name ->
                List.of("SystemRoot", "WINDIR", "TEMP", "TMP", "PATH").contains(name)));
        assertFalse(recorder.environment.containsKey("GIT_ASKPASS"));
        assertEquals(0, recorder.runCalls);
    }

    private static final class RecordingExecutor implements ProcessExecutor {
        UUID id;
        List<String> command;
        Map<String, String> environment;
        int runCalls;

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
            return new Observation(capability, true, 0, "", "", Map.of("executorStatus", "SUCCEEDED", "processExited", true));
        }
    }
}
