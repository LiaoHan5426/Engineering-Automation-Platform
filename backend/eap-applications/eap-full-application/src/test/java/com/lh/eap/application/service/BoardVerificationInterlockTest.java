package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

class BoardVerificationInterlockTest {
    @Test void existingRunStartRefusesAnotherTasksWorkspaceVerification() {
        var jdbc = mock(JdbcTemplate.class); var tasks = mock(BoardTaskService.class); var id = UUID.randomUUID();
        when(tasks.find(eq(id), eq("p"), eq(true))).thenReturn(new BoardTaskService.Task(id, "p", "title", "ready", "", "", 1, List.of(), "none", "goal", "criteria", false, null));
        when(tasks.hasActiveVerification("workspace")).thenReturn(true);
        var manager = new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction() { return new Object(); }
            protected void doBegin(Object tx, TransactionDefinition definition) {}
            protected void doCommit(DefaultTransactionStatus status) {}
            protected void doRollback(DefaultTransactionStatus status) {}
        };
        var service = new BoardRunService(jdbc, tasks, mock(HandoffStore.class), mock(MissionService.class), mock(MissionExecutionStore.class), mock(MissionGitExecutionService.class), manager, mock(BoardPrototypeService.class), Runnable::run, false);
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", assertThrows(ResponseStatusException.class, () -> service.start(id, new BoardRunService.Start("p", 1, UUID.randomUUID(), "workspace"))).getReason());
        verify(tasks).lockWorkspace("workspace");
    }
    @Test @SuppressWarnings("unchecked") void reviewCannotCaptureWhileAnotherTaskVerifiesTheSameWorkspace() {
        var jdbc = mock(JdbcTemplate.class); var tasks = mock(BoardTaskService.class); var executions = mock(MissionExecutionStore.class);
        var task = UUID.randomUUID(); var run = UUID.randomUUID();
        when(jdbc.query(anyString(), any(RowMapper.class), eq(task), eq(run))).thenReturn(List.of(Optional.empty()));
        var execution = mock(MissionExecution.class); when(execution.workspacePath()).thenReturn("workspace"); when(executions.find(run)).thenReturn(Optional.of(execution));
        when(tasks.hasActiveVerification("workspace")).thenReturn(true);
        var service = new BoardReviewService(jdbc, tasks, executions, mock(MissionGitExecutionService.class), mock(com.lh.eap.core.CapabilityRegistry.class), mock(com.lh.eap.runtime.handler.CapabilityHandlerRegistry.class), mock(CapabilitySettings.class), mock(GitReviewCapture.class));
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", assertThrows(ResponseStatusException.class, () -> service.collect(task, run, new BoardReviewService.Request("p", "workspace"))).getReason());
        verify(tasks).lockWorkspace("workspace");
    }
}
