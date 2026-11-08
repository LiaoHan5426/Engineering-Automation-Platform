package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.lh.eap.api.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class BoardVerificationWorkerTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static class Fixture {
        final JdbcTemplate jdbc = mock(JdbcTemplate.class);
        final BoardTaskService tasks = mock(BoardTaskService.class);
        final MissionExecutionStore executions = mock(MissionExecutionStore.class);
        final MissionGitExecutionService git = mock(MissionGitExecutionService.class);
        final CapabilityRegistry registry = new CapabilityRegistry().register(new GitCapability("status"));
        final CapabilitySettings settings = mock(CapabilitySettings.class);
        final BoardVerificationPlanSupport plans = mock(BoardVerificationPlanSupport.class);
        final ProcessExecutor process = mock(ProcessExecutor.class);
        final UUID task = UUID.randomUUID(), run = UUID.randomUUID();
        final String workspace = Path.of(".").toAbsolutePath().normalize().toString();
        final Queue<Runnable> queue = new ArrayDeque<>();
        final List<BoardVerificationService.Record> writes = new ArrayList<>();
        BoardVerificationService.Record saved;
        boolean committed;
        final BoardVerificationPlanSupport.Plan plan = new BoardVerificationPlanSupport.Plan("a".repeat(64), workspace, "b".repeat(40), new BoardVerificationSource.Source("frontend", "c".repeat(64), List.of(), List.of()),
            List.of(new BoardVerificationPlanSupport.Command("typecheck", List.of("vp", "exec", "vue-tsc", "--build"), Path.of(workspace).resolve("frontend").toString(), 120),
                new BoardVerificationPlanSupport.Command("test", List.of("vp", "test", "run"), Path.of(workspace).resolve("frontend").toString(), 120),
                new BoardVerificationPlanSupport.Command("build", List.of("vp", "build"), Path.of(workspace).resolve("frontend").toString(), 120)));
        final AbstractPlatformTransactionManager manager = new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction() { return new Object(); }
            protected void doBegin(Object tx, TransactionDefinition definition) {}
            protected void doCommit(DefaultTransactionStatus status) { committed = true; }
            protected void doRollback(DefaultTransactionStatus status) {}
        };
        final BoardVerificationService service;
        Fixture() { this(null); }
        @SuppressWarnings("unchecked") Fixture(Executor override) {
            when(settings.enabled(anyString())).thenReturn(true);
            when(tasks.find(eq(task), eq("p"), anyBoolean())).thenReturn(new BoardTaskService.Task(task, "p", "title", "ready", "", "", 1, List.of(), "none", "goal", "criteria", false, null));
            var execution = mock(MissionExecution.class); when(execution.status()).thenReturn("SUCCEEDED"); when(execution.workspacePath()).thenReturn(workspace); when(execution.executable()).thenReturn("git");
            when(executions.find(run)).thenReturn(Optional.of(execution));
            when(git.availability()).thenReturn(new MissionGitExecutionService.Availability(true, workspace, "ws", ""));
            when(plans.availability()).thenReturn(""); when(plans.prepare(any(), any())).thenReturn(plan);
            when(jdbc.query(anyString(), any(RowMapper.class), eq(task), eq(run))).thenAnswer(call -> List.of(Optional.ofNullable(saved)));
            when(jdbc.update(contains("verification_snapshot=?::jsonb"), any(), eq(task), eq(run))).thenAnswer(call -> {
                String sql = call.getArgument(0);
                if (sql.contains("IS NULL") && saved != null || sql.contains("='QUEUED'") && !"QUEUED".equals(saved.status()) || sql.contains("='RUNNING'") && !"RUNNING".equals(saved.status())) return 0;
                saved = JSON.readValue((String)call.getArgument(1), BoardVerificationService.Record.class); writes.add(saved); return 1;
            });
            when(process.runIsolated(eq("vp"), any(), anyList(), anyMap())).thenAnswer(call -> {
                assertEquals("RUNNING", saved.status()); assertEquals("RUNNING", saved.checks().getLast().status());
                assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
                return result("SUCCEEDED", 0, true, "ok");
            });
            service = new BoardVerificationService(jdbc, tasks, executions, git, registry, settings, plans, process, manager,
                override != null ? override : command -> { assertTrue(committed); assertEquals("QUEUED", saved.status()); queue.add(command); });
        }
        BoardVerificationService.Start request() { return new BoardVerificationService.Start("p", workspace, plan.planHash()); }
        BoardVerificationService.Record start() { return service.start(task, run, request()); }
    }
    private static Observation result(String status, int code, boolean cleanup, String output) {
        return new Observation("vp", code == 0, code, output, "", Map.of("executorStatus", status, "processTreeCleanup", cleanup, "processExited", true));
    }
    @Test void readsDoNotScanAndOtherTaskActivityBlocksPlanning() {
        var f = new Fixture(); when(f.tasks.hasActiveWorkspace(f.workspace)).thenReturn(true);
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", f.service.get(f.task, f.run, "p").reason());
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", assertThrows(ResponseStatusException.class, () -> f.service.plan(f.task, f.run, new BoardVerificationService.Request("p", f.workspace))).getReason());
        verify(f.plans, never()).prepare(any(), any()); verifyNoInteractions(f.process); assertNull(f.saved);
    }
    @Test void changedWorkspaceAndDisabledCapabilityCannotPrepareOrQueue() {
        var f = new Fixture();
        assertEquals("BOARD_WORKSPACE_CHANGED", assertThrows(ResponseStatusException.class, () -> f.service.plan(f.task, f.run, new BoardVerificationService.Request("p", "other"))).getReason());
        when(f.settings.enabled("vp")).thenReturn(false);
        assertEquals("CAPABILITY_DISABLED", assertThrows(ResponseStatusException.class, f::start).getReason());
        verify(f.plans, never()).prepare(any(), any()); assertTrue(f.queue.isEmpty());
    }
    @Test void completedRunCannotPrepareAnotherPlan() {
        var f = new Fixture(); f.start(); f.queue.remove().run(); clearInvocations(f.plans);
        assertEquals("BOARD_VERIFICATION_ALREADY_RECORDED", assertThrows(ResponseStatusException.class, () -> f.service.plan(f.task, f.run, new BoardVerificationService.Request("p", f.workspace))).getReason());
        verify(f.plans, never()).prepare(any(), any());
    }
    @Test void authorizationRevokedBeforeDispatchFailsWithoutClaimingAnUnknownProcess() {
        var f = new Fixture(); f.start();
        when(f.settings.enabled("vp")).thenReturn(false);
        f.queue.remove().run();
        assertEquals("FAILED", f.saved.status()); assertEquals("CAPABILITY_DISABLED", f.saved.reason());
        assertNotNull(f.saved.finishedAt()); verifyNoInteractions(f.process);
    }
    @Test void sourceReadDenialAfterConfirmedCleanupFailsButUnknownPreparationProcessRemainsBlocked() {
        for (var reason : List.of("BOARD_VERIFICATION_SOURCE_UNREADABLE", "BOARD_VERIFICATION_PROCESS_UNKNOWN")) {
            var f = new Fixture(); f.start();
            when(f.plans.prepare(any(), any())).thenReturn(f.plan).thenThrow(BoardVerificationSource.denied(reason));
            f.queue.remove().run();
            assertEquals(reason.endsWith("PROCESS_UNKNOWN") ? "UNKNOWN" : "FAILED", f.saved.status());
            assertEquals(reason, f.saved.reason());
            assertEquals("PASSED", f.saved.checks().getFirst().status());
            verify(f.process, times(1)).runIsolated(eq("vp"), any(), anyList(), anyMap());
        }
    }

    @Test void reservationUsesTheSharedWorkspaceLockBeforeQueueing() {
        var f = new Fixture(); f.start();
        var calls = mockingDetails(f.tasks).getInvocations().stream().map(call -> call.getMethod().getName()).toList();
        assertTrue(calls.contains("lockWorkspace"), "cross-task workspace reservation must be serialized");
        assertTrue(calls.contains("hasActiveWorkspace"), "cross-task activity must be checked under the lock");
    }
    @Test void restartRecoveryIsPresentAndOnlyTouchesOpenVerificationRows() throws Exception {
        var f = new Fixture();
        var recover = assertDoesNotThrow(() -> BoardVerificationService.class.getMethod("markRestartUnknown"));
        recover.invoke(f.service);
        verify(f.jdbc).update(argThat((String sql) -> sql.contains("UNKNOWN") && sql.contains("'QUEUED','RUNNING'") && sql.contains("jsonb_set") && !sql.contains("DELETE")));
    }
    @Test void sourceChangeBetweenChecksStopsBeforeTheNextProcess() {
        var f = new Fixture(); f.start();
        var changed = new BoardVerificationPlanSupport.Plan("d".repeat(64), f.workspace, f.plan.baseCommit(), f.plan.source(), f.plan.commands());
        when(f.plans.prepare(any(), any())).thenReturn(f.plan, changed);
        f.queue.remove().run(); assertEquals("STALE", f.saved.status());
        assertEquals(1, f.saved.checks().size()); verify(f.process, times(1)).runIsolated(eq("vp"), any(), anyList(), anyMap());
    }
    @Test void exitZeroWithoutExitEvidenceCannotBePassed() {
        var f = new Fixture();
        doReturn(new Observation("vp", true, 0, "", "", Map.of("processTreeCleanup", true, "executorStatus", "SUCCEEDED")))
            .when(f.process).runIsolated(eq("vp"), any(), anyList(), anyMap());
        f.start(); f.queue.remove().run(); assertEquals("UNKNOWN", f.saved.status()); assertNull(f.saved.finishedAt());
    }
    @Test void timeoutFailureAndUnconfirmedCleanupRetainBoundedRedactedEvidence() {
        for (var state : List.of("TIMED_OUT", "FAILED", "UNKNOWN")) {
            var f = new Fixture(); boolean cleanup = !state.equals("UNKNOWN");
            doReturn(result(state.equals("UNKNOWN") ? "SUCCEEDED" : state, state.equals("TIMED_OUT") ? 124 : state.equals("FAILED") ? 1 : 0, cleanup, "token=private-value\n" + "x".repeat(18000)))
                .when(f.process).runIsolated(eq("vp"), any(), anyList(), anyMap());
            f.start(); f.queue.remove().run();
            assertEquals(state.equals("UNKNOWN") ? "UNKNOWN" : "FAILED", f.saved.status());
            var check = f.saved.checks().getFirst(); assertEquals(state, check.status());
            assertTrue(check.truncated()); assertTrue(check.stdout().length() <= 16384); assertFalse(check.stdout().contains("private-value"));
            verify(f.process, times(1)).runIsolated(eq("vp"), any(), anyList(), anyMap());
        }
    }
    @Test void staleConfirmationRejectsBeforeQueueAndDifferentPlanHashDoesNotOverwrite() {
        var f = new Fixture();
        var bad = new BoardVerificationService.Start("p", f.workspace, "f".repeat(64));
        assertEquals("BOARD_VERIFICATION_PLAN_STALE", assertThrows(ResponseStatusException.class, () -> f.service.start(f.task, f.run, bad)).getReason());
        assertNull(f.saved); assertTrue(f.queue.isEmpty());
        f.start(); var original = f.saved;
        assertEquals("BOARD_VERIFICATION_REQUEST_CONFLICT", assertThrows(ResponseStatusException.class, () -> f.service.start(f.task, f.run, bad)).getReason());
        assertEquals(original, f.saved);
    }
    @Test void unconfirmedWorkerFailureKeepsEarlierCheckProgress() {
        var f = new Fixture(); doReturn(result("SUCCEEDED", 0, true, "first")).doThrow(new IllegalStateException("sensitive exception"))
            .when(f.process).runIsolated(eq("vp"), any(), anyList(), anyMap());
        f.start(); f.queue.remove().run(); assertEquals("UNKNOWN", f.saved.status());
        assertEquals("PASSED", f.saved.checks().getFirst().status()); assertFalse(JSON.writeValueAsString(f.saved).contains("sensitive exception"));
    }
    @Test void workerClaimsOncePersistsCheckProgressAndReplaysWithoutExecutingAgain() {
        var f = new Fixture(); f.start(); var worker = f.queue.remove(); worker.run(); worker.run();
        assertEquals("PASSED", f.saved.status()); assertEquals(3, f.saved.checks().size());
        assertTrue(f.saved.checks().stream().allMatch(check -> check.status().equals("PASSED") && check.processTreeCleanup()));
        assertEquals(f.plan.source(), f.saved.sourceAfter()); assertNotNull(f.saved.finishedAt());
        assertEquals(f.saved, f.service.get(f.task, f.run, "p").record()); assertEquals(f.saved, f.start());
        verify(f.process, times(3)).runIsolated(eq("vp"), any(), anyList(), anyMap());
        verify(f.tasks, never()).update(any(), any());
    }
}
