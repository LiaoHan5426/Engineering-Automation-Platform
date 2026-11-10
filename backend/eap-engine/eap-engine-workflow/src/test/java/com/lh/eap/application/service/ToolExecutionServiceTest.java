package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.lh.eap.api.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.runtime.handler.*;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.UnaryOperator;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.server.ResponseStatusException;

class ToolExecutionServiceTest {
    @TempDir Path workspace;
    final MemoryStore store = new MemoryStore();
    final CapabilitySettings settings = mock(CapabilitySettings.class);
    final CapabilityHandlerRegistry handlers = mock(CapabilityHandlerRegistry.class);
    ToolExecutionService service;
    final java.util.concurrent.atomic.AtomicReference<String> configuredBinary = new java.util.concurrent.atomic.AtomicReference<>();

    @BeforeEach void prepare() { when(settings.enabled("git-status")).thenReturn(true); when(settings.enabled("git-diff")).thenReturn(true); }
    @AfterEach void close() { if (service != null) service.close(); }
    ToolExecutionService service(ProcessExecutor executor) {
        var binary = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
        configuredBinary.set(binary);
        var registry = new CapabilityRegistry().register(new GitCapability("status", configuredBinary::get)).register(new GitCapability("diff", configuredBinary::get));
        for (var operation : List.of("git-status", "git-diff"))
            when(handlers.resolveFor(null, operation)).thenReturn(Optional.of(mock(GitInspectionHandler.class)));
        return service = new ToolExecutionService(store, RuntimeWorkspace.colocated(workspace, "", ""), settings, handlers, registry, executor);
    }
    ToolExecution finished(UUID id) throws Exception { return finished("git-status", id); }
    ToolExecution finished(String operation, UUID id) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < until) {
            var row = service.get(operation, id);
            if (!row.active()) return row;
            Thread.sleep(5);
        }
        fail("Execution did not settle"); return null;
    }
    @Test void persistsAllSafeStepsAndDeduplicatesCompletedRequest() throws Exception {
        var executor = new Probe(); service(executor);
        var request = UUID.randomUUID(); var started = service.start(request);
        var row = finished(started.id());
        assertEquals("SUCCEEDED", row.status());
        assertEquals(List.of("root", "filters", "status"), row.steps().stream().map(ToolExecution.Step::phase).toList());
        assertTrue(row.steps().stream().allMatch(step -> Boolean.TRUE.equals(step.evidence().get("processTreeCleanup"))));
        assertEquals(3, executor.calls.get());
        assertEquals(row, service.start(request));
        assertEquals(row, service.cancel(row.id()));
        assertEquals(3, executor.calls.get());
    }
    @ParameterizedTest @CsvSource({"git-status,0", "git-status,1", "git-status,2", "git-diff,0", "git-diff,1", "git-diff,2"})
    void cancellationCoversAllGitPhasesAndWaitsForExitEvidence(String operation, int phase) throws Exception {
        var executor = new Probe(); executor.blockAt = phase; service(executor);
        var row = service.start(operation, UUID.randomUUID());
        assertTrue(executor.started.await(3, TimeUnit.SECONDS));
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(operation, UUID.randomUUID()));
        var pending = service.cancel(operation, row.id());
        assertEquals("CANCELLING", pending.status());
        assertNull(pending.exitEvidence());
        executor.release.countDown();
        row = finished(operation, row.id());
        assertEquals("CANCELLED", row.status());
        assertTrue(row.cancelRequested());
        assertNotNull(row.exitEvidence());
        assertEquals(phase + 1, executor.calls.get(), "No later Git step may start");
    }
    @Test void unconfirmedCleanupAndRestartRemainBlocking() throws Exception {
        var executor = new Probe(); executor.cleaned = false; service(executor);
        var row = finished(service.start(UUID.randomUUID()).id());
        assertEquals("UNKNOWN", row.status());
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
        assertEquals("UNKNOWN", service.cancel(row.id()).status());
        assertEquals(1, executor.calls.get());
    }
    @Test void restartDoesNotReplayOrKillOldProcesses() throws Exception {
        service(new Probe());
        var id = UUID.randomUUID();
        store.insert(new ToolExecution(id, UUID.randomUUID(), "git", "git-status", workspace.toRealPath().toString(),
                "git", "RUNNING", false, Instant.now(), null, null, "", "", false, null, null, List.of()));
        service.afterPropertiesSet();
        assertEquals("UNKNOWN", service.get(id).status());
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
    }
    @Test void databaseFailureBeforeReservationNeverRunsAProcess() {
        var executor = new Probe(); service(executor); store.failInsert = true;
        assertThrows(IllegalStateException.class, () -> service.start(UUID.randomUUID()));
        assertEquals(0, executor.calls.get());
    }
    @Test void identityPersistenceFailureNeverClaimsSuccessfulExecution() throws Exception {
        var executor = new Probe(); service(executor); store.failRunningStep = true;
        var row = finished(service.start(UUID.randomUUID()).id());
        assertEquals("UNKNOWN", row.status());
        assertEquals(1, executor.calls.get());
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
    }
    @Test void disabledCapabilityIsRejectedBeforeAnyReservation() {
        var executor = new Probe(); service(executor); when(settings.enabled("git-status")).thenReturn(false);
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.start(UUID.randomUUID())).getStatusCode().value());
        assertTrue(store.rows.isEmpty()); assertEquals(0, executor.calls.get());
    }
    @Test void recordsAreBoundToTheCurrentAuthorizedWorkspace() {
        service(new Probe()); var id = UUID.randomUUID();
        store.insert(new ToolExecution(id, UUID.randomUUID(), "git", "git-status", "/different", "git", "UNKNOWN", false,
                Instant.now(), null, null, "", "", false, null, "test", List.of()));
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.get(id)).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.cancel(id)).getStatusCode().value());
    }

    @Test void diffIsIsolatedAndCrossOperationRequestReuseIsAConflict() throws Exception {
        var executor = new Probe(); service(executor);
        var status = finished(service.start(UUID.randomUUID()).id());
        var conflict = assertThrows(ResponseStatusException.class, () -> service.start("git-diff", status.requestId()));
        assertEquals(409, conflict.getStatusCode().value());
        assertEquals("REQUEST_ID_OPERATION_CONFLICT", conflict.getReason());
        var diff = finished("git-diff", service.start("git-diff", UUID.randomUUID()).id());
        assertEquals("SUCCEEDED", diff.status());
        assertEquals(List.of("root", "filters", "diff"), diff.steps().stream().map(ToolExecution.Step::phase).toList());
        assertTrue(diff.steps().getLast().command().containsAll(List.of("diff", "--no-ext-diff", "--no-textconv", "--no-color")));
        assertEquals(diff, service.start("git-diff", diff.requestId()));
        assertEquals(List.of(status), service.list(20));
        assertEquals(List.of(diff), service.list("git-diff", 20));
        for (boolean cancel : List.of(false, true)) {
            assertEquals(404, assertThrows(ResponseStatusException.class, () -> {
                if (cancel) service.cancel("git-status", diff.id()); else service.get("git-status", diff.id());
            }).getStatusCode().value());
            assertEquals(404, assertThrows(ResponseStatusException.class, () -> {
                if (cancel) service.cancel("git-diff", status.id()); else service.get("git-diff", status.id());
            }).getStatusCode().value());
        }
        assertEquals(6, executor.calls.get());
    }
    @Test void unknownAndDisabledStatusDoNotBlockDiffAndDiffCanBeDisabledIndependently() throws Exception {
        var executor = new Probe(); executor.cleaned = false; service(executor);
        var status = finished(service.start(UUID.randomUUID()).id());
        assertEquals("UNKNOWN", status.status());
        when(settings.enabled("git-status")).thenReturn(false);
        executor.cleaned = true;
        assertEquals("SUCCEEDED", finished("git-diff", service.start("git-diff", UUID.randomUUID()).id()).status());
        when(settings.enabled("git-diff")).thenReturn(false);
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.start("git-diff", UUID.randomUUID())).getStatusCode().value());
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.start("git-log", UUID.randomUUID())).getStatusCode().value());
    }
    @Test void diffOutputIsRedactedAndBounded() throws Exception {
        var executor = new Probe(); executor.inspectionOutput = "password=super-secret\n" + "x".repeat(9000); service(executor);
        var diff = finished("git-diff", service.start("git-diff", UUID.randomUUID()).id());
        assertEquals("SUCCEEDED", diff.status());
        assertTrue(diff.truncated()); assertEquals(8000, diff.stdout().length());
        assertFalse(diff.stdout().contains("super-secret"));
    }

    @Test void inFlightOperationsHaveIndependentReservations() throws Exception {
        var executor = new Probe(); executor.blockAt = 0; service(executor);
        var status = service.start(UUID.randomUUID());
        assertTrue(executor.started.await(3, TimeUnit.SECONDS));
        var diff = service.start("git-diff", UUID.randomUUID());
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start("git-diff", UUID.randomUUID()));
        service.cancel(status.id());
        executor.release.countDown();
        assertEquals("CANCELLED", finished(status.id()).status());
        assertEquals("SUCCEEDED", finished("git-diff", diff.id()).status());
    }
    @Test void crossOperationRequestRaceStillReturnsConflict() throws Exception {
        var executor = new Probe(); service(executor);
        var request = UUID.randomUUID();
        store.reservationWinner = new ToolExecution(UUID.randomUUID(), request, "git", "git-diff",
                workspace.toRealPath().toString(), "git", "SUCCEEDED", false, Instant.now(), Instant.now(),
                0, "", "", false, "PROCESS_EXIT_CONFIRMED", null, List.of());
        var conflict = assertThrows(ResponseStatusException.class, () -> service.start(request));
        assertEquals(409, conflict.getStatusCode().value()); assertEquals("REQUEST_ID_OPERATION_CONFLICT", conflict.getReason());
        assertEquals(0, executor.calls.get());
    }

    @ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings = {"git-status", "git-diff"})
    void selectedOperationMustHaveItsOwnHandler(String operation) {
        var executor = new Probe(); service(executor);
        when(handlers.resolveFor(null, operation)).thenReturn(Optional.empty());
        var failure = assertThrows(ResponseStatusException.class, () -> service.start(operation, UUID.randomUUID()));
        assertEquals(409, failure.getStatusCode().value());
        assertEquals(operation.equals("git-status") ? "GIT_STATUS_HANDLER_MISSING" : "GIT_DIFF_HANDLER_MISSING", failure.getReason());
        assertTrue(store.rows.isEmpty()); assertEquals(0, executor.calls.get());
    }

    private ToolExecution unknownRow(String operation) throws Exception {
        var row = new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", operation, workspace.toRealPath().toString(),
                "git", "UNKNOWN", true, Instant.now(), null, null, "partial evidence", "", true, null,
                "SERVICE_RESTART_EXIT_UNCONFIRMED", List.of(new ToolExecution.Step(UUID.randomUUID(), "root", "RUNNING",
                List.of("git", "rev-parse"), Map.of("processPid", 42L))));
        store.insert(row); return row;
    }
    @ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings = {"git-status", "git-diff"})
    void manualClosurePreservesUnknownEvidenceAndOnlyReleasesTheReviewedOperation(String operation) throws Exception {
        var executor = new Probe(); service(executor);
        var original = unknownRow(operation); var request = UUID.randomUUID();
        var note = "Verified execution and all related child processes stopped; password=test-secret";
        var closed = service.resolveUnknown(operation, original.id(), request, note, true);
        assertEquals("CLOSED_UNKNOWN", closed.status()); assertFalse(closed.blocking());
        assertEquals(original.stdout(), closed.stdout()); assertEquals(original.steps(), closed.steps());
        assertEquals(original.unconfirmedReason(), closed.unconfirmedReason());
        assertEquals(original.exitCode(), closed.exitCode()); assertEquals(original.exitEvidence(), closed.exitEvidence());
        assertEquals(original.finishedAt(), closed.finishedAt()); assertEquals(original.cancelRequested(), closed.cancelRequested());
        assertEquals("local-operator", closed.resolution().operator()); assertNotNull(closed.resolution().resolvedAt());
        assertFalse(closed.resolution().note().contains("test-secret"));
        assertEquals(closed, service.resolveUnknown(operation, original.id(), request, note, true));
        assertEquals(closed, service.start(operation, original.requestId()));
        assertEquals(closed, service.cancel(operation, closed.id()));
        assertEquals(0, executor.calls.get(), "Review cannot execute or replay a process");
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown(operation, original.id(), request, note + " changed", true)).getStatusCode().value());
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown(operation, original.id(), UUID.randomUUID(), note, true)).getStatusCode().value());
        assertEquals("SUCCEEDED", finished(operation, service.start(operation, UUID.randomUUID()).id()).status());
    }
    @Test void reviewIsScopedValidatedAndCannotCloseAnOwnedOrKnownExecution() throws Exception {
        var executor = new Probe(); executor.blockAt = 0; service(executor);
        var row = service.start(UUID.randomUUID()); assertTrue(executor.started.await(3, TimeUnit.SECONDS));
        // Even an UNKNOWN written while its worker still unwinds must remain blocked.
        store.update(row.id(), value -> value.state("UNKNOWN", false, null, null, "", "", false, null, "test", value.steps()));
        assertEquals("EXECUTION_OWNER_STILL_ACTIVE", assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown("git-status", row.id(), UUID.randomUUID(), "Reviewed all processes", true)).getReason());
        executor.release.countDown();
        service.close(); service = null; // Wait for worker release before further assertions.
        service(new Probe());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown("git-diff", row.id(), UUID.randomUUID(), "Reviewed all processes", true)).getStatusCode().value());
        for (var note : List.of("", "short", "x".repeat(2001))) {
            assertEquals(400, assertThrows(ResponseStatusException.class,
                    () -> service.resolveUnknown("git-status", row.id(), UUID.randomUUID(), note, true)).getStatusCode().value());
        }
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown("git-status", row.id(), UUID.randomUUID(), "Reviewed all processes", false)).getStatusCode().value());
        var terminal = finished("git-diff", service.start("git-diff", UUID.randomUUID()).id());
        assertEquals("EXECUTION_NOT_UNKNOWN", assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown("git-diff", terminal.id(), UUID.randomUUID(), "Reviewed all processes", true)).getReason());
        var other = new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-status", "/other", "git", "UNKNOWN",
                false, Instant.now(), null, null, "", "", false, null, "test", List.of());
        store.insert(other);
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown("git-status", other.id(), UUID.randomUUID(), "Reviewed all processes", true)).getStatusCode().value());
    }
    @Test void concurrentManualReviewsHaveOneImmutableWinner() throws Exception {
        service(new Probe()); var row = unknownRow("git-diff");
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var gate = new CountDownLatch(1);
            var tasks = new ArrayList<Future<String>>();
            for (int i = 0; i < 2; i++) tasks.add(pool.submit(() -> {
                gate.await();
                try { return service.resolveUnknown("git-diff", row.id(), UUID.randomUUID(), "Verified all related processes stopped", true).status(); }
                catch (ResponseStatusException conflict) { return conflict.getReason(); }
            }));
            gate.countDown();
            assertEquals(Set.of("CLOSED_UNKNOWN", "UNKNOWN_REVIEW_CONFLICT"),
                    Set.of(tasks.get(0).get(3, TimeUnit.SECONDS), tasks.get(1).get(3, TimeUnit.SECONDS)));
        }
    }

    @Test void processReviewIsScopedBoundedAndNeverChangesUnknownOrStartsAProcess() throws Exception {
        var executor = new Probe(); service(executor); var original = unknownRow("git-diff");
        var steps = new ArrayList<ToolExecution.Step>();
        for (int i = 0; i < 12; i++) steps.add(new ToolExecution.Step(UUID.randomUUID(), "root", "RUNNING",
                List.of("git"), Map.of("processPid", -1)));
        store.update(original.id(), row -> row.state("UNKNOWN", row.cancelRequested(), null, null, row.stdout(), "",
                false, null, row.unconfirmedReason(), steps));
        var before = store.find(original.id()).orElseThrow();
        var review = service.inspectProcesses("git-diff", original.id());
        assertEquals(original.id(), review.executionId()); assertEquals("UNKNOWN", review.executionStatus());
        assertNotNull(review.observedAt()); assertFalse(review.completeProcessTreeEvidence());
        assertTrue(review.truncated()); assertEquals(8, review.steps().size());
        assertTrue(review.steps().stream().allMatch(step -> step.process().status().equals("NOT_CAPTURED")));
        assertEquals(before, store.find(original.id()).orElseThrow()); assertEquals(0, executor.calls.get());
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start("git-diff", UUID.randomUUID()));
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service.inspectProcesses("git-status", original.id())).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service.inspectProcesses("git-log", original.id())).getStatusCode().value());
        var closed = service.resolveUnknown("git-diff", original.id(), UUID.randomUUID(), "Fixture never started any related process", true);
        assertEquals("CLOSED_UNKNOWN", service.inspectProcesses("git-diff", closed.id()).executionStatus());
        var known = finished(service.start(UUID.randomUUID()).id());
        assertEquals(409, assertThrows(ResponseStatusException.class,
                () -> service.inspectProcesses("git-status", known.id())).getStatusCode().value());
    }

    @Test void descendantEvidenceIsDurableBeforeExitAndSurvivesUnknown() throws Exception {
        var probe = new Probe(); probe.blockAt = 0; probe.publishDescendants = true; probe.cleaned = false;
        service(probe);
        var row = service.start(UUID.randomUUID());
        assertTrue(probe.started.await(3, TimeUnit.SECONDS));
        var running = store.find(row.id()).orElseThrow();
        assertEquals(1, ((List<?>) running.steps().getFirst().evidence().get("processDescendants")).size());
        probe.release.countDown();
        var unknown = finished(row.id());
        assertEquals("UNKNOWN", unknown.status());
        var before = store.find(row.id()).orElseThrow();
        var review = service.inspectProcesses("git-status", row.id());
        assertTrue(review.steps().getFirst().descendantsCaptured());
        assertEquals("NOT_CAPTURED", review.steps().getFirst().descendants().getFirst().status());
        assertEquals(before, store.find(row.id()).orElseThrow());
    }

    @Test void descendantProjectionHandlesLegacyEmptyMalformedAndOversizedEvidence() throws Exception {
        service(new Probe()); var row = unknownRow("git-diff");
        var large = java.util.Collections.nCopies(40, Map.of("processPid", -1));
        var steps = List.of(
                new ToolExecution.Step(UUID.randomUUID(), "legacy", "RUNNING", List.of(), Map.of()),
                new ToolExecution.Step(UUID.randomUUID(), "empty", "RUNNING", List.of(), Map.of("processDescendants", List.of())),
                new ToolExecution.Step(UUID.randomUUID(), "malformed", "RUNNING", List.of(), Map.of("processDescendants", List.of("bad"))),
                new ToolExecution.Step(UUID.randomUUID(), "large", "RUNNING", List.of(), Map.of("processDescendants", large)));
        store.update(row.id(), current -> current.state("UNKNOWN", false, null, null, "", "", false, null, "fixture", steps));
        var review = service.inspectProcesses("git-diff", row.id());
        assertFalse(review.steps().get(0).descendantsCaptured());
        assertTrue(review.steps().get(1).descendantsCaptured()); assertTrue(review.steps().get(1).descendants().isEmpty());
        assertEquals("NOT_CAPTURED", review.steps().get(2).descendants().getFirst().status());
        assertTrue(review.steps().get(3).descendantsTruncated()); assertEquals(32, review.steps().get(3).descendants().size());
        assertFalse(review.completeProcessTreeEvidence());
    }

    @ParameterizedTest @CsvSource({"git-status,0", "git-status,1", "git-diff,0", "git-diff,1"})
    void revokedAuthorizationStopsBeforeTheNextGitProcess(String operation, int phase) throws Exception {
        var executor = new Probe(); executor.blockAt = phase; service(executor);
        var row = service.start(operation, UUID.randomUUID());
        assertTrue(executor.started.await(3, TimeUnit.SECONDS));
        when(settings.enabled(operation)).thenReturn(false);
        executor.release.countDown();
        var rejected = finished(operation, row.id());
        assertEquals("REJECTED", rejected.status());
        assertEquals("CAPABILITY_DISABLED", rejected.stderr());
        assertEquals("NO_FURTHER_PROCESS_STARTED", rejected.exitEvidence());
        assertEquals(phase + 1, executor.calls.get());
        assertTrue(rejected.steps().stream().allMatch(step -> !step.status().equals("RUNNING")));
    }
    @ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings = {"git-status", "git-diff"})
    void reviewCommitFailureIsTranslatedInsideTheApplicationWithoutChangingTheRecord(String operation) throws Exception {
        var executor = new Probe(); executor.cleaned = false; service(executor);
        var row = finished(operation, service.start(operation, UUID.randomUUID()).id());
        service.close();
        store.failReviewCommit = true;
        var failure = assertThrows(org.springframework.dao.DataAccessResourceFailureException.class,
                () -> service.resolveUnknown(operation, row.id(), UUID.randomUUID(), "Verified all related processes stopped", true));
        assertInstanceOf(org.springframework.transaction.TransactionSystemException.class, failure.getCause());
        assertEquals(row, store.find(row.id()).orElseThrow());
    }
    @ParameterizedTest @CsvSource({"git-status,workspace", "git-diff,workspace", "git-status,binary", "git-diff,binary"})
    void changedWorkspaceOrExecutableStopsBeforeTheFinalCommandAndRecoversExplicitly(String operation, String failure) throws Exception {
        var executor = new Probe(); executor.blockAt = 1; service(executor);
        var row = service.start(operation, UUID.randomUUID());
        assertTrue(executor.started.await(3, TimeUnit.SECONDS));
        var originalBinary = configuredBinary.get();
        var moved = workspace.resolveSibling(workspace.getFileName() + "-suspended");
        try {
            if (failure.equals("workspace")) java.nio.file.Files.move(workspace, moved);
            else configuredBinary.set(workspace.resolve("missing-executable").toString());
            executor.release.countDown();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            ToolExecution stopped;
            do {
                stopped = store.find(row.id()).orElseThrow();
                if (!stopped.active()) break;
                Thread.sleep(5);
            } while (System.nanoTime() < deadline);
            assertEquals("REJECTED", stopped.status());
            assertEquals(failure.equals("workspace") ? "AUTHORIZED_ROOT_MISSING" : "BINARY_MISSING", stopped.stderr());
            assertEquals("NO_FURTHER_PROCESS_STARTED", stopped.exitEvidence());
            assertEquals(2, executor.calls.get(), "Final status/diff process must not start");
        } finally {
            if (java.nio.file.Files.exists(moved)) java.nio.file.Files.move(moved, workspace);
            configuredBinary.set(originalBinary);
        }
        assertTrue(service.readiness(operation).canStart());
        assertEquals("SUCCEEDED", finished(operation, service.start(operation, UUID.randomUUID()).id()).status());
        assertEquals(5, executor.calls.get());
    }
    @ParameterizedTest @org.junit.jupiter.params.provider.ValueSource(strings = {"git-status", "git-diff"})
    void readinessIsReadOnlyAndSeparatesAuthorizationFromUnknownReservation(String operation) throws Exception {
        var executor = new Probe(); executor.cleaned = false; service(executor);
        var row = finished(operation, service.start(operation, UUID.randomUUID()).id());
        var before = store.find(row.id()).orElseThrow();
        var ready = service.readiness(operation);
        assertTrue(ready.scopeAccessible()); assertTrue(ready.authorized()); assertFalse(ready.canStart());
        assertEquals(row.id(), ready.blockingExecutionId()); assertEquals("UNKNOWN", ready.blockingStatus());
        assertEquals(before, store.find(row.id()).orElseThrow());
        when(settings.enabled(operation)).thenReturn(false);
        ready = service.readiness(operation);
        assertTrue(ready.scopeAccessible()); assertFalse(ready.authorized());
        assertEquals("CAPABILITY_DISABLED", ready.reason());
        assertEquals(before, store.find(row.id()).orElseThrow());
        var moved = workspace.resolveSibling(workspace.getFileName() + "-unavailable");
        java.nio.file.Files.move(workspace, moved);
        try {
            ready = service.readiness(operation);
            assertFalse(ready.scopeAccessible()); assertFalse(ready.canStart());
            assertEquals("AUTHORIZED_ROOT_MISSING", ready.reason());
            assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.get(operation, row.id())).getStatusCode().value());
            assertEquals(before, store.find(row.id()).orElseThrow());
        } finally { java.nio.file.Files.move(moved, workspace); }
        when(settings.enabled(operation)).thenReturn(true);
        assertEquals(row, service.get(operation, row.id()));
        assertTrue(service.readiness(operation).authorized());
        assertEquals(1, executor.calls.get());
    }
    static class Probe implements ProcessExecutor {
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1);
        int blockAt = -1; boolean cleaned = true, publishDescendants; String inspectionOutput = "## test";
        public Observation run(String name, Path dir, List<String> argv) { throw new AssertionError("Unmanaged execution"); }
        @Override public Observation runManaged(UUID id, String name, Path dir, List<String> argv, Map<String,String> env, ManagedProcessControl control) {
            calls.incrementAndGet();
            int phase = argv.contains("rev-parse") ? 0 : argv.contains("config") ? 1 : 2;
            assertTrue(env.containsKey("GIT_OPTIONAL_LOCKS"));
            control.started(Map.of("processPid", 42L, "processExecutable", argv.getFirst()));
            if (publishDescendants) control.descendantsObserved(Map.of("processDescendants", List.of(Map.of("processPid", -1)),
                    "processDescendantsTruncated", false));
            if (phase == blockAt) {
                started.countDown();
                try { assertTrue(release.await(3, TimeUnit.SECONDS)); }
                catch (InterruptedException interrupted) { throw new IllegalStateException(interrupted); }
            }
            boolean cancel = control.cancellationRequested();
            String output = phase == 0 ? dir.toString() : phase == 2 ? inspectionOutput : "";
            int code = cancel ? 130 : phase == 1 ? 1 : 0;
            var status = cancel ? "CANCELLED" : code == 0 ? "SUCCEEDED" : "FAILED";
            return new Observation(name, code == 0, code, output, "", Map.of("executorStatus", status,
                    "processExited", true, "processTreeCleanup", cleaned, "processNotStarted", false));
        }
    }
    static class MemoryStore implements ToolExecutionStore {
        final Map<UUID,ToolExecution> rows = new LinkedHashMap<>();
        boolean failInsert, failRunningStep, failReviewCommit;
        ToolExecution reservationWinner;
        public synchronized void insert(ToolExecution row) { if (failInsert) throw new IllegalStateException("insert failed");
            if (reservationWinner != null) {
                rows.put(reservationWinner.id(), reservationWinner); reservationWinner = null;
                throw new org.springframework.dao.DuplicateKeyException("Concurrent reservation");
            }
            if (rows.values().stream().anyMatch(existing -> existing.workspacePath().equals(row.workspacePath())
                    && (existing.requestId().equals(row.requestId()) || (existing.capabilityId().equals(row.capabilityId())
                    && existing.blocking() && row.blocking()))))
                throw new org.springframework.dao.DuplicateKeyException("Duplicate reservation");
            rows.put(row.id(), row); }
        public synchronized Optional<ToolExecution> find(UUID id) { return Optional.ofNullable(rows.get(id)); }
        public synchronized Optional<ToolExecution> request(String workspace, UUID id) { return rows.values().stream().filter(row -> row.workspacePath().equals(workspace) && row.requestId().equals(id)).findFirst(); }
        public synchronized List<ToolExecution> list(String workspace, String operation, int limit) { return rows.values().stream().filter(row -> row.workspacePath().equals(workspace) && row.capabilityId().equals(operation)).limit(limit).toList(); }
        public synchronized Optional<ToolExecution> blocking(String workspace, String operation) { return rows.values().stream().filter(row -> row.workspacePath().equals(workspace) && row.capabilityId().equals(operation) && row.blocking()).findFirst(); }
        public synchronized ToolExecution update(UUID id, UnaryOperator<ToolExecution> transition) {
            var next = transition.apply(rows.get(id));
            if (failReviewCommit && next.status().equals("CLOSED_UNKNOWN")) throw new org.springframework.transaction.TransactionSystemException("Commit result unavailable");
            if (failRunningStep && next.steps().stream().anyMatch(step -> step.status().equals("RUNNING"))) throw new IllegalStateException("identity write failed");
            rows.put(id, next); return next;
        }
        public synchronized void markRestartUnknown() { rows.replaceAll((id, row) -> row.active() ? row.state("UNKNOWN", row.cancelRequested(), null, null, "", "", false, null, "SERVICE_RESTART_EXIT_UNCONFIRMED", row.steps()) : row); }
    }
}
