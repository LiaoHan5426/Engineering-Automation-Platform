package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import tools.jackson.databind.json.JsonMapper;

class BoardVerificationServiceTest {
    @Test void commitsQueuedRecordBeforeDispatchAndDuplicateDoesNotDispatchAgain() throws Exception {
        var type = assertDoesNotThrow(() -> Class.forName("com.lh.eap.application.service.BoardVerificationService"), "durable verification service is missing");
        var jdbc = mock(JdbcTemplate.class); var tasks = mock(BoardTaskService.class);
        var executions = mock(MissionExecutionStore.class); var git = mock(MissionGitExecutionService.class);
        var registry = new CapabilityRegistry().register(new GitCapability("status"));
        var settings = mock(CapabilitySettings.class); when(settings.enabled(anyString())).thenReturn(true);
        var plans = mock(BoardVerificationPlanSupport.class); var process = mock(ProcessExecutor.class);
        var taskId = UUID.randomUUID(); var runId = UUID.randomUUID(); var workspace = Path.of(".").toAbsolutePath().normalize().toString();
        var task = new BoardTaskService.Task(taskId, "p", "title", "ready", "", "", 1, List.of(), "none", "goal", "criteria", false, null);
        when(tasks.find(eq(taskId), eq("p"), anyBoolean())).thenReturn(task);
        var execution = mock(MissionExecution.class); when(execution.status()).thenReturn("SUCCEEDED"); when(execution.workspacePath()).thenReturn(workspace); when(execution.executable()).thenReturn("git");
        when(executions.find(runId)).thenReturn(Optional.of(execution));
        when(git.availability()).thenReturn(new MissionGitExecutionService.Availability(true, workspace, "ws", ""));
        when(plans.availability()).thenReturn("");
        var plan = new BoardVerificationPlanSupport.Plan("a".repeat(64), workspace, "b".repeat(40), new BoardVerificationSource.Source("frontend", "c".repeat(64), List.of(), List.of()), List.of());
        when(plans.prepare(any(), any())).thenReturn(plan);
        var saved = new AtomicReference<String>(); var json = JsonMapper.builder().build();
        var recordType = Class.forName(type.getName() + "$Record");
        when(jdbc.query(anyString(), any(RowMapper.class), eq(taskId), eq(runId))).thenAnswer(call -> List.of(saved.get() == null ? Optional.empty() : Optional.of(json.readValue(saved.get(), recordType))));
        when(jdbc.update(contains("verification_snapshot=?::jsonb"), any(), eq(taskId), eq(runId))).thenAnswer(call -> { saved.set(call.getArgument(1)); return 1; });
        var committed = new boolean[]{false}; var queue = new ArrayList<Runnable>();
        var manager = new AbstractPlatformTransactionManager() {
            protected Object doGetTransaction() { return new Object(); }
            protected void doBegin(Object tx, TransactionDefinition definition) {}
            protected void doCommit(DefaultTransactionStatus status) { committed[0] = true; }
            protected void doRollback(DefaultTransactionStatus status) {}
        };
        Executor dispatcher = command -> { assertTrue(committed[0]); assertEquals("QUEUED", json.readTree(saved.get()).get("status").asText()); queue.add(command); };
        var constructor = type.getDeclaredConstructor(JdbcTemplate.class, BoardTaskService.class, MissionExecutionStore.class, MissionGitExecutionService.class, CapabilityRegistry.class, CapabilitySettings.class, BoardVerificationPlanSupport.class, ProcessExecutor.class, PlatformTransactionManager.class, Executor.class);
        constructor.setAccessible(true);
        var service = constructor.newInstance(jdbc, tasks, executions, git, registry, settings, plans, process, manager, dispatcher);
        var requestType = Class.forName(type.getName() + "$Start");
        var request = requestType.getConstructor(String.class, String.class, String.class).newInstance("p", workspace, plan.planHash());
        var method = type.getMethod("start", UUID.class, UUID.class, requestType);
        var first = method.invoke(service, taskId, runId, request);
        assertEquals("QUEUED", json.valueToTree(first).get("status").asText());
        assertEquals(first, method.invoke(service, taskId, runId, request)); assertEquals(1, queue.size());
        verifyNoInteractions(process);
    }
}
