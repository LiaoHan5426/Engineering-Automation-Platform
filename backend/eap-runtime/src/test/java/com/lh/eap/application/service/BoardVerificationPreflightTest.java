package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.api.Observation;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.Executor;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class BoardVerificationPreflightTest {
    /** Transactional fixture: only committed JSON survives rollback, including an enclosing request. */
    private static final class Transactions extends AbstractPlatformTransactionManager {
        private static final class State { boolean rollbackOnly; String snapshot; }
        private static final class Tx implements SmartTransactionObject {
            State state;
            Tx(State state) { this.state = state; }
            public boolean isRollbackOnly() { return state != null && state.rollbackOnly; }
        }
        private State current;
        String committed;
        protected Object doGetTransaction() { return new Tx(current); }
        protected boolean isExistingTransaction(Object tx) { return ((Tx) tx).state != null; }
        protected void doBegin(Object tx, TransactionDefinition definition) {
            current = new State(); current.snapshot = committed; ((Tx) tx).state = current;
        }
        protected void doCommit(DefaultTransactionStatus status) { committed = ((Tx) status.getTransaction()).state.snapshot; }
        protected void doRollback(DefaultTransactionStatus status) {}
        protected void doSetRollbackOnly(DefaultTransactionStatus status) { ((Tx) status.getTransaction()).state.rollbackOnly = true; }
        protected Object doSuspend(Object tx) { var suspended = current; current = null; ((Tx) tx).state = null; return suspended; }
        protected void doResume(Object tx, Object suspended) { current = (State) suspended; ((Tx) tx).state = current; }
        protected void doCleanupAfterCompletion(Object tx) { current = null; }
        String read() { return current == null ? committed : current.snapshot; }
        void write(String snapshot) { assertNotNull(current); current.snapshot = snapshot; }
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    @SuppressWarnings("unchecked")
    void unknownPreflightSurvivesRequestRollbackAndBlocksReuse(boolean start) {
        var jdbc = mock(JdbcTemplate.class); var tasks = mock(BoardTaskService.class);
        var executions = mock(MissionExecutionStore.class); var git = mock(MissionGitExecutionService.class);
        var settings = mock(CapabilitySettings.class);
        var channels = mock(CliChannels.class); var preflightProcess = mock(ProcessExecutor.class);
        when(channels.channel("vp", "vp")).thenReturn(new CliChannels.Channel("vp", "vp.exe", "fixture", "vp.exe", com.lh.eap.domain.model.CapabilityAvailability.AVAILABLE));
        when(preflightProcess.runIsolated(anyString(), any(), anyList(), anyMap())).thenReturn(
            new Observation("git-status", false, -1, "", "", Map.of("processTreeCleanup", false)));
        var plans = spy(new BoardVerificationPlanSupport(preflightProcess, channels, new BoardVerificationSource()));
        var process = mock(ProcessExecutor.class); var dispatcher = mock(Executor.class);
        var manager = new Transactions(); var json = JsonMapper.builder().build();
        var taskId = UUID.randomUUID(); var runId = UUID.randomUUID();
        var workspace = Path.of(".").toAbsolutePath().normalize().toString();
        when(tasks.find(any(), eq("p"), anyBoolean())).thenReturn(new BoardTaskService.Task(taskId, "p", "title", "ready", "", "", 1, List.of(), "none", "goal", "criteria", false, null));
        var execution = mock(MissionExecution.class);
        when(execution.status()).thenReturn("SUCCEEDED"); when(execution.workspacePath()).thenReturn(workspace); when(execution.executable()).thenReturn("git");
        when(executions.find(any())).thenReturn(Optional.of(execution));
        when(git.availability()).thenReturn(new MissionGitExecutionService.Availability(true, workspace, "ws", ""));
        when(settings.enabled("vp")).thenReturn(true);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(taskId), eq(runId))).thenAnswer(call -> List.of(manager.read() == null ? Optional.empty() : Optional.of(json.readValue(manager.read(), BoardVerificationService.Record.class))));
        when(jdbc.update(contains("verification_snapshot=?::jsonb"), any(), eq(taskId), eq(runId))).thenAnswer(call -> { manager.write(call.getArgument(1)); return 1; });
        when(tasks.hasActiveWorkspace(workspace)).thenAnswer(call -> manager.read() != null);
        var service = new BoardVerificationService(jdbc, tasks, executions, git, new CapabilityRegistry().register(new GitCapability("status")), settings, plans, process, manager, dispatcher);
        var outer = new TransactionTemplate(manager);
        outer.executeWithoutResult(status -> {
            var failure = assertThrows(ResponseStatusException.class, () -> {
                if (start) service.start(taskId, runId, new BoardVerificationService.Start("p", workspace, "a".repeat(64)));
                else service.plan(taskId, runId, new BoardVerificationService.Request("p", workspace));
            });
            assertEquals("BOARD_VERIFICATION_PROCESS_UNKNOWN", failure.getReason());
            status.setRollbackOnly();
        });
        assertNotNull(manager.committed, "unknown process must leave a committed identity despite request rollback");
        var page = service.get(taskId, runId, "p");
        assertFalse(page.prepareAllowed()); assertNotNull(page.record().id());
        assertEquals("UNKNOWN", page.record().status());
        assertEquals("BOARD_VERIFICATION_PROCESS_UNKNOWN", page.record().reason());
        assertNull(page.record().plan(), "a failed preflight cannot fabricate a plan or source hash");
        assertTrue(page.record().checks().isEmpty()); assertNull(page.record().finishedAt());
        assertEquals(workspace, json.readTree(manager.committed).get("workspacePath").asText());
        assertEquals("BOARD_VERIFICATION_ALREADY_RECORDED", assertThrows(ResponseStatusException.class, () -> service.plan(taskId, runId, new BoardVerificationService.Request("p", workspace))).getReason());
        assertThrows(ResponseStatusException.class, () -> service.start(taskId, runId, new BoardVerificationService.Start("p", workspace, "a".repeat(64))));
        var otherTask = UUID.randomUUID(); var otherRun = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), eq(otherTask), eq(otherRun))).thenReturn(List.of(Optional.empty()));
        assertFalse(service.get(otherTask, otherRun, "p").prepareAllowed());
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", assertThrows(ResponseStatusException.class, () -> service.plan(otherTask, otherRun, new BoardVerificationService.Request("p", workspace))).getReason());
        verify(plans, times(1)).prepare(any(), any());
        verify(preflightProcess, times(1)).runIsolated(eq("git-status"), any(), anyList(), anyMap());
        verify(tasks, atLeastOnce()).lockWorkspace(workspace);
        verifyNoInteractions(process, dispatcher);
    }
}
