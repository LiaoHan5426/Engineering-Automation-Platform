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

    @BeforeEach void prepare() { when(settings.enabled("git-status")).thenReturn(true); when(settings.enabled("git-diff")).thenReturn(true); }
    @AfterEach void close() { if (service != null) service.close(); }
    ToolExecutionService service(ProcessExecutor executor) {
        var binary = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
        var registry = new CapabilityRegistry().register(new GitCapability("status", () -> binary)).register(new GitCapability("diff", () -> binary));
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

    static class Probe implements ProcessExecutor {
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1);
        int blockAt = -1; boolean cleaned = true; String inspectionOutput = "## test";
        public Observation run(String name, Path dir, List<String> argv) { throw new AssertionError("Unmanaged execution"); }
        @Override public Observation runManaged(UUID id, String name, Path dir, List<String> argv, Map<String,String> env, ManagedProcessControl control) {
            calls.incrementAndGet();
            int phase = argv.contains("rev-parse") ? 0 : argv.contains("config") ? 1 : 2;
            assertTrue(env.containsKey("GIT_OPTIONAL_LOCKS"));
            control.started(Map.of("processPid", 42L, "processExecutable", argv.getFirst()));
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
        boolean failInsert, failRunningStep;
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
            if (failRunningStep && next.steps().stream().anyMatch(step -> step.status().equals("RUNNING"))) throw new IllegalStateException("identity write failed");
            rows.put(id, next); return next;
        }
        public synchronized void markRestartUnknown() { rows.replaceAll((id, row) -> row.active() ? row.state("UNKNOWN", row.cancelRequested(), null, null, "", "", false, null, "SERVICE_RESTART_EXIT_UNCONFIRMED", row.steps()) : row); }
    }
}
