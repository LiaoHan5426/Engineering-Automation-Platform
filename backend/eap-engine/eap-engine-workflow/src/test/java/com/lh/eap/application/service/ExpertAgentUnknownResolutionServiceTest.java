package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.ExpertAgentAccess;
import com.lh.eap.core.ExpertAgentJournal;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.error.AgentErrors;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

/** Service contract for the SQL-expert UNKNOWN manual resolution. No real database or model. */
class ExpertAgentUnknownResolutionServiceTest {
    static class LocalTransactions extends AbstractPlatformTransactionManager {
        protected Object doGetTransaction() { return new Object(); }
        protected void doBegin(Object transaction, TransactionDefinition definition) { }
        protected void doCommit(DefaultTransactionStatus status) { }
        protected void doRollback(DefaultTransactionStatus status) { }
    }

    private static final String NOTE = "Checked the workspace file and the durable review record.";

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ExpertAgentJournal journal = mock(ExpertAgentJournal.class);
    private final ExpertAgentApprovalService service = spy(new ExpertAgentApprovalService(
            mock(CodeChangeService.class), journal, mock(ExpertAgentAccess.class), jdbc,
            new LocalTransactions()));

    private ExpertAgentApprovalService ready(UUID id) {
        var expert = "sql-readonly-agent";
        when(journal.get(expert, id)).thenReturn(new ExpertAgentJournal.Entry(id, null, "{}", "{}",
                "unknown", 0, null, null, Instant.now().plusSeconds(3600), null, false));
        doReturn(Map.of("run", Map.of("state", "closed-unconfirmed"))).when(service).inspect(expert, id);
        return service;
    }

    private static ResponseStatusException failure(String reason, Runnable action) {
        var error = assertThrows(ResponseStatusException.class, action::run);
        assertEquals(reason, error.getReason());
        return error;
    }

    @Test
    void shortNoteIsRejectedBeforeAnyWrite() {
        var id = UUID.randomUUID();
        var api = ready(id);
        var error = failure(AgentErrors.AGENT_INPUT_INVALID.code(), () -> api.resolveUnknown("sql-readonly-agent", id, " too short "));
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        verifyNoInteractions(jdbc);
    }

    @Test
    void blankNoteIsRejectedBeforeAnyWrite() {
        var id = UUID.randomUUID();
        var api = ready(id);
        failure(AgentErrors.AGENT_INPUT_INVALID.code(), () -> api.resolveUnknown("sql-readonly-agent", id, "   "));
        verifyNoInteractions(jdbc);
    }

    @Test
    void missingV5ColumnsRefusesExplicitlyWithoutSqlFailure() {
        var id = UUID.randomUUID();
        var api = ready(id);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class))).thenReturn(false);
        var error = failure(AgentErrors.AGENT_UNKNOWN_NOT_RESOLVABLE.code(), () -> api.resolveUnknown("sql-readonly-agent", id, NOTE));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void conditionalUpdateMismatchDoesNotProjectTask() {
        var id = UUID.randomUUID();
        var api = ready(id);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class))).thenReturn(true);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(0);
        failure(AgentErrors.AGENT_UNKNOWN_NOT_RESOLVABLE.code(), () -> api.resolveUnknown("sql-readonly-agent", id, NOTE));
        verify(jdbc, times(1)).update(anyString(), any(Object[].class));
    }

    @Test
    void successUsesServerOwnedAuditOnlyUpdatesUnknownAndProjectsTaskInSameTransaction() {
        var id = UUID.randomUUID();
        var expert = "sql-readonly-agent";
        var api = ready(id);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class))).thenReturn(true);
        var updates = new ArrayList<List<Object>>();
        when(jdbc.update(anyString(), any(Object[].class))).thenAnswer(call -> {
            assertTrue(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            var row = new ArrayList<Object>();
            for (Object argument : call.getArguments()) row.add(argument);
            updates.add(row);
            return 1;
        });
        var result = api.resolveUnknown(expert, id, "  " + NOTE + "  ");
        assertEquals(Map.of("run", Map.of("state", "closed-unconfirmed")), result);

        assertEquals(2, updates.size());
        var run = updates.getFirst();
        assertTrue(run.getFirst().toString().contains("resolution_note"));
        assertEquals("closed-unconfirmed", run.get(1));
        assertEquals(NOTE, run.get(2)); // trimmed, not the raw request
        assertEquals(RuntimeWorkspace.OPERATOR_LABEL, run.get(3));
        assertEquals(id, run.get(4));
        assertEquals(expert, run.get(5));
        assertEquals("unknown", run.get(6));
        var task = updates.get(1);
        assertTrue(task.getFirst().toString().contains("UPDATE eap.task"));
        assertEquals("closed-unconfirmed", task.get(1));
        assertEquals(id, task.get(2));
    }
}
