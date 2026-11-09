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
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

class ToolExecutionServiceTest {
    @TempDir Path workspace;
    final MemoryStore store = new MemoryStore();
    final CapabilitySettings settings = mock(CapabilitySettings.class);
    final CapabilityHandlerRegistry handlers = mock(CapabilityHandlerRegistry.class);
    ToolExecutionService service;

    @BeforeEach void prepare() { when(settings.enabled("git-status")).thenReturn(true); }
    @AfterEach void close() { if (service != null) service.close(); }
    ToolExecutionService service(ProcessExecutor executor) {
        var binary = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
        var registry = new CapabilityRegistry().register(new GitCapability("status", () -> binary));
        when(handlers.resolveFor(null, "git-status")).thenReturn(Optional.of(mock(GitInspectionHandler.class)));
        return service = new ToolExecutionService(store, RuntimeWorkspace.colocated(workspace, "", ""), settings, handlers, registry, executor);
    }
    ToolExecution finished(UUID id) throws Exception {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (System.nanoTime() < until) {
            var row = service.get(id);
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
    @ParameterizedTest @ValueSource(ints = {0, 1, 2})
    void cancellationCoversPreflightAndStatusAndWaitsForExitEvidence(int phase) throws Exception {
        var executor = new Probe(); executor.blockAt = phase; service(executor);
        var row = service.start(UUID.randomUUID());
        assertTrue(executor.started.await(3, TimeUnit.SECONDS));
        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
        var pending = service.cancel(row.id());
        assertEquals("CANCELLING", pending.status());
        assertNull(pending.exitEvidence());
        executor.release.countDown();
        row = finished(row.id());
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

    static class Probe implements ProcessExecutor {
        final AtomicInteger calls = new AtomicInteger();
        final CountDownLatch started = new CountDownLatch(1), release = new CountDownLatch(1);
        int blockAt = -1; boolean cleaned = true;
        public Observation run(String name, Path dir, List<String> argv) { throw new AssertionError("Unmanaged execution"); }
        @Override public Observation runManaged(UUID id, String name, Path dir, List<String> argv, Map<String,String> env, ManagedProcessControl control) {
            int phase = calls.getAndIncrement();
            assertTrue(env.containsKey("GIT_OPTIONAL_LOCKS"));
            control.started(Map.of("processPid", 42L, "processExecutable", argv.getFirst()));
            if (phase == blockAt) {
                started.countDown();
                try { assertTrue(release.await(3, TimeUnit.SECONDS)); }
                catch (InterruptedException interrupted) { throw new IllegalStateException(interrupted); }
            }
            boolean cancel = control.cancellationRequested();
            String output = phase == 0 ? dir.toString() : phase == 2 ? "## test" : "";
            int code = cancel ? 130 : phase == 1 ? 1 : 0;
            var status = cancel ? "CANCELLED" : code == 0 ? "SUCCEEDED" : "FAILED";
            return new Observation(name, code == 0, code, output, "", Map.of("executorStatus", status,
                    "processExited", true, "processTreeCleanup", cleaned, "processNotStarted", false));
        }
    }
    static class MemoryStore implements ToolExecutionStore {
        final Map<UUID,ToolExecution> rows = new LinkedHashMap<>();
        boolean failInsert, failRunningStep;
        public synchronized void insert(ToolExecution row) { if (failInsert) throw new IllegalStateException("insert failed"); rows.put(row.id(), row); }
        public synchronized Optional<ToolExecution> find(UUID id) { return Optional.ofNullable(rows.get(id)); }
        public synchronized Optional<ToolExecution> request(String workspace, UUID id) { return rows.values().stream().filter(row -> row.workspacePath().equals(workspace) && row.requestId().equals(id)).findFirst(); }
        public synchronized List<ToolExecution> list(String workspace, int limit) { return rows.values().stream().filter(row -> row.workspacePath().equals(workspace)).limit(limit).toList(); }
        public synchronized Optional<ToolExecution> blocking(String workspace) { return rows.values().stream().filter(row -> row.workspacePath().equals(workspace) && row.blocking()).findFirst(); }
        public synchronized ToolExecution update(UUID id, UnaryOperator<ToolExecution> transition) {
            var next = transition.apply(rows.get(id));
            if (failRunningStep && next.steps().stream().anyMatch(step -> step.status().equals("RUNNING"))) throw new IllegalStateException("identity write failed");
            rows.put(id, next); return next;
        }
        public synchronized void markRestartUnknown() { rows.replaceAll((id, row) -> row.active() ? row.state("UNKNOWN", row.cancelRequested(), null, null, "", "", false, null, "SERVICE_RESTART_EXIT_UNCONFIRMED", row.steps()) : row); }
    }
}
