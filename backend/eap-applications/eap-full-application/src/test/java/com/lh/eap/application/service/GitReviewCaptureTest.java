package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.api.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class GitReviewCaptureTest {
    @TempDir Path repo;
    private DefaultProcessExecutor executor;
    private final GitCapability capability = new GitCapability("diff");
    @BeforeEach void init() throws Exception {
        executor = new DefaultProcessExecutor();
        git("init"); Files.writeString(repo.resolve("tracked.txt"), "baseline\n"); git("add", "tracked.txt");
        git("-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "baseline");
    }
    @AfterEach void close() { executor.close(); }
    private void git(String... args) {
        var command = new ArrayList<>(List.of("git")); command.addAll(List.of(args));
        var result = executor.runIsolated("fixture", repo, command, GitCapability.environment());
        assertEquals(0, result.exitCode(), result.stderr());
    }
    @Test void capturesTrackedStagedAndUnstagedChangesWithActualWhitespaceFailureAndStableHash() throws Exception {
        Files.writeString(repo.resolve("tracked.txt"), "staged\n"); git("add", "tracked.txt");
        Files.writeString(repo.resolve("tracked.txt"), "staged\nunstaged  \n"); Files.writeString(repo.resolve("untracked.txt"), "not included");
        git("config", "diff.external", "must-not-execute-for-review");
        var evidence = new GitReviewCapture(executor).capture(repo.toRealPath(), capability); var snapshot = evidence.snapshot();
        assertEquals("INCOMPLETE", snapshot.status()); assertTrue(snapshot.issues().contains("UNTRACKED_NOT_INCLUDED"));
        assertTrue(snapshot.diff().contains("+staged")); assertTrue(snapshot.diff().contains("+unstaged  "));
        assertFalse(snapshot.diff().contains("not included")); assertTrue(snapshot.repositoryStatus().contains("untracked.txt"));
        assertEquals("FAILED", snapshot.check().status()); assertTrue(snapshot.check().exitCode() > 0); assertTrue(snapshot.check().output().contains("trailing whitespace"));
        assertEquals(snapshot.baseCommit(), snapshot.headAfter()); assertEquals(9, snapshot.steps().size());
        assertEquals(GitReviewCapture.hash(JsonMapper.builder().build().writeValueAsString(snapshot)), evidence.contentHash());
        assertEquals("staged\nunstaged  \n", Files.readString(repo.resolve("tracked.txt")));
    }
    @Test void detectsContentChangesEvenWhenPorcelainStatusStaysTheSame() throws Exception {
        Files.writeString(repo.resolve("tracked.txt"), "first\n");
        var changing = new DelegatingExecutor() {
            int diffs;
            @Override public Observation runIsolated(String name, Path path, List<String> command, Map<String,String> environment) {
                if (command.contains("--src-prefix=a/") && ++diffs == 2) {
                    try { Files.writeString(repo.resolve("tracked.txt"), "second\n"); } catch (Exception failure) { throw new RuntimeException(failure); }
                }
                return super.runIsolated(name, path, command, environment);
            }
        };
        var snapshot = new GitReviewCapture(changing).capture(repo.toRealPath(), capability).snapshot();
        assertEquals("CHANGED", snapshot.status()); assertEquals("STALE", snapshot.check().status());
        assertTrue(snapshot.issues().contains("WORKSPACE_CHANGED_DURING_CAPTURE")); assertTrue(snapshot.diff().contains("+first"));
    }
    @Test void flagsRedactionTruncationAndBinaryWithoutCallingThemComplete() throws Exception {
        Files.writeString(repo.resolve("tracked.txt"), "token=abc-123\n" + "a".repeat(140000) + "\n");
        var snapshot = new GitReviewCapture(executor).capture(repo.toRealPath(), capability).snapshot();
        assertEquals("INCOMPLETE", snapshot.status()); assertTrue(snapshot.issues().containsAll(List.of("CONTENT_REDACTED", "OUTPUT_TRUNCATED")));
        assertFalse(snapshot.diff().contains("abc-123")); assertTrue(snapshot.diff().contains("[REDACTED]")); assertEquals(131072, snapshot.diff().length());
        Files.write(repo.resolve("tracked.txt"), new byte[]{0,1,2});
        var binary = new GitReviewCapture(executor).capture(repo.toRealPath(), capability).snapshot();
        assertEquals("INCOMPLETE", binary.status()); assertTrue(binary.issues().contains("BINARY_NOT_EXPANDED"));
    }
    @Test void rejectsParentRepositoryDiscoveryAndRecordsUnknownOrTruncatedProcessEvidence() throws Exception {
        var child = Files.createDirectory(repo.resolve("child"));
        var outside = new GitReviewCapture(executor).capture(child.toRealPath(), capability).snapshot();
        assertEquals("FAILED", outside.status()); assertEquals("NOT_RUN", outside.check().status());
        assertTrue(outside.issues().contains("REPOSITORY_ROOT_MISMATCH")); assertEquals(1, outside.steps().size());
        var unknown = new DelegatingExecutor() {
            @Override public Observation runIsolated(String name, Path path, List<String> command, Map<String,String> environment) {
                return new Observation(name, true, 0, "", "", Map.of());
            }
        };
        var failed = new GitReviewCapture(unknown).capture(repo.toRealPath(), capability).snapshot();
        assertEquals("FAILED", failed.status()); assertTrue(failed.issues().contains("GIT_STEP_FAILED"));
        var truncated = new DelegatingExecutor() {
            @Override public Observation runIsolated(String name, Path path, List<String> command, Map<String,String> environment) {
                var actual = super.runIsolated(name, path, command, environment);
                var metadata = new HashMap<>(actual.metadata()); if (command.contains("diff")) metadata.put("truncated", true);
                return new Observation(name, actual.success(), actual.exitCode(), actual.stdout(), actual.stderr(), metadata);
            }
        };
        var partial = new GitReviewCapture(truncated).capture(repo.toRealPath(), capability).snapshot();
        assertEquals("INCOMPLETE", partial.status()); assertEquals("INCOMPLETE", partial.check().status());
    }
    @Test void preservesLineEndingNormalizationAndDisablesRepositoryCleanFilters() throws Exception {
        git("config", "core.autocrlf", "true");
        Files.writeString(repo.resolve("tracked.txt"), "baseline\r\nnew line\r\n");
        var normal = new GitReviewCapture(executor).capture(repo.toRealPath(), capability).snapshot();
        assertTrue(normal.diff().contains("+new line\n")); assertFalse(normal.diff().contains("-baseline"));
        assertEquals("PASSED", normal.check().status());
        git("config", "filter.danger.clean", "echo executed > filter-marker.txt");
        git("config", "filter.danger.required", "true");
        Files.writeString(repo.resolve(".gitattributes"), "tracked.txt filter=danger\n");
        var filtered = new GitReviewCapture(executor).capture(repo.toRealPath(), capability).snapshot();
        assertFalse(Files.exists(repo.resolve("filter-marker.txt")));
        assertEquals("INCOMPLETE", filtered.status()); assertTrue(filtered.issues().contains("FILTERS_DISABLED"));
        assertTrue(filtered.diff().contains("+new line"));
    }
    private class DelegatingExecutor implements ProcessExecutor {
        public Observation run(String name, Path path, List<String> command) { return executor.run(name, path, command); }
        public Observation runIsolated(String name, Path path, List<String> command, Map<String,String> environment) { return executor.runIsolated(name, path, command, environment); }
    }
}
