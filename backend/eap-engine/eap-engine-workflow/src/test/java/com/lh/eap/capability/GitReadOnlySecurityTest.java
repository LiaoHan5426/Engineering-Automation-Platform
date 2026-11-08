package com.lh.eap.capability;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.api.*;
import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.params.provider.CsvSource;

class GitReadOnlySecurityTest {
    @TempDir Path repo;
    private DefaultProcessExecutor executor;
    private final List<List<String>> commands = new ArrayList<>();
    private final ProcessExecutor recording = new ProcessExecutor() {
        public Observation run(String name, Path path, List<String> command) {
            commands.add(command);
            return executor.run(name, path, command);
        }
        public Observation runIsolated(String name, Path path, List<String> command, Map<String, String> env) {
            commands.add(command);
            return executor.runIsolated(name, path, command, env);
        }
        public Observation runManaged(UUID id, String name, Path path, List<String> command, Map<String, String> env) {
            commands.add(command);
            return executor.runManaged(id, name, path, command, env);
        }
    };

    @BeforeEach void init() {
        executor = new DefaultProcessExecutor();
        git("init");
    }
    @AfterEach void close() { executor.close(); }

    @ParameterizedTest @ValueSource(strings = {"status", "diff"})
    void rejectsParentRepositoryBeforeReadingStatusOrDiff(String operation) throws Exception {
        Files.writeString(repo.resolve("outside.txt"), "must not be observed");
        var child = Files.createDirectory(repo.resolve("authorized-child"));
        var capability = new GitCapability(operation);
        var context = new ExecutionContext(child, recording);
        var result = capability.execute(context);
        assertFalse(result.success());
        assertEquals("REPOSITORY_ROOT_MISMATCH", result.stderr());
        assertEquals(1, commands.size());
        assertTrue(commands.getFirst().contains("--show-toplevel"));
        commands.clear();
        var managed = capability.executeManaged(UUID.randomUUID(), context);
        assertFalse(managed.success());
        assertEquals("REPOSITORY_ROOT_MISMATCH", managed.stderr());
        assertEquals(1, commands.size());
        assertTrue(commands.getFirst().contains("--show-toplevel"));
    }

    @ParameterizedTest
    @CsvSource({"status,core.fsmonitor", "diff,core.fsmonitor", "status,filter.danger.clean",
            "diff,filter.danger.clean", "status,filter.danger.process", "diff,filter.danger.process",
            "diff,diff.external", "diff,diff.danger.textconv"})
    void neverInvokesConfiguredHelpers(String operation, String helper) throws Exception {
        Files.writeString(repo.resolve("tracked.txt"), "baseline\n");
        git("add", "tracked.txt");
        git("-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "baseline");
        git("config", helper, "echo helper-executed > helper-marker.txt");
        git("config", "filter.danger.required", "true");
        Files.writeString(repo.resolve(".gitattributes"), "tracked.txt filter=danger diff=danger\n");
        Files.writeString(repo.resolve("tracked.txt"), "baseline\nchanged content\n");
        var before = Files.readAllBytes(repo.resolve(".git/index"));
        var capability = new GitCapability(operation);
        var result = capability.execute(new ExecutionContext(repo, recording));
        assertFalse(Files.exists(repo.resolve("helper-marker.txt")), helper + " must not execute");
        assertTrue(result.success(), result.stderr());
        assertTrue(result.stdout().contains("tracked.txt"));
        assertArrayEquals(before, Files.readAllBytes(repo.resolve(".git/index")), "read-only inspection must not refresh index");
        var managed = capability.executeManaged(UUID.randomUUID(), new ExecutionContext(repo, recording));
        assertTrue(managed.success(), managed.stderr());
        assertFalse(Files.exists(repo.resolve("helper-marker.txt")));
    }

    private void git(String... args) {
        var command = new ArrayList<>(List.of("git"));
        command.addAll(List.of(args));
        var result = executor.runIsolated("fixture", repo, command, GitCapability.environment());
        assertTrue(result.success(), result.stderr());
    }
}
