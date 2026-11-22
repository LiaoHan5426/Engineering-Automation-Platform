package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.ExpertAgentAccess;
import com.lh.eap.core.ExpertAgentJournal;
import com.lh.eap.core.ExpertApprovalStore;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.error.AgentErrors;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.http.HttpStatus;
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

    private final ExpertApprovalStore store = mock(ExpertApprovalStore.class);
    private final ExpertAgentJournal journal = mock(ExpertAgentJournal.class);
    private final ExpertAgentApprovalService service = spy(new ExpertAgentApprovalService(
            mock(CodeChangeService.class), journal, mock(ExpertAgentAccess.class), store,
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
        verifyNoInteractions(store);
    }

    @Test
    void blankNoteIsRejectedBeforeAnyWrite() {
        var id = UUID.randomUUID();
        var api = ready(id);
        failure(AgentErrors.AGENT_INPUT_INVALID.code(), () -> api.resolveUnknown("sql-readonly-agent", id, "   "));
        verifyNoInteractions(store);
    }

    @Test
    void missingV5ColumnsRefusesExplicitlyWithoutSqlFailure() {
        var id = UUID.randomUUID();
        var api = ready(id);
        when(store.hasResolutionColumns()).thenReturn(false);
        var error = failure(AgentErrors.AGENT_UNKNOWN_NOT_RESOLVABLE.code(), () -> api.resolveUnknown("sql-readonly-agent", id, NOTE));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(store, never()).resolveUnknown(any(), anyString(), anyString(), anyString(), anyString(), anyString());
        verify(store, never()).markTaskNeedsReview(any(), anyString());
    }

    @Test
    void conditionalUpdateMismatchDoesNotProjectTask() {
        var id = UUID.randomUUID();
        var api = ready(id);
        when(store.hasResolutionColumns()).thenReturn(true);
        when(store.resolveUnknown(eq(id), eq("sql-readonly-agent"), eq("closed-unconfirmed"), eq("unknown"), eq(NOTE),
                eq(RuntimeWorkspace.OPERATOR_LABEL))).thenReturn(0);
        failure(AgentErrors.AGENT_UNKNOWN_NOT_RESOLVABLE.code(), () -> api.resolveUnknown("sql-readonly-agent", id, NOTE));
        verify(store, times(1)).resolveUnknown(id, "sql-readonly-agent", "closed-unconfirmed", "unknown", NOTE,
                RuntimeWorkspace.OPERATOR_LABEL);
        verify(store, never()).markTaskNeedsReview(any(), anyString());
    }

    @Test
    void successUsesServerOwnedAuditOnlyUpdatesUnknownAndProjectsTaskInSameTransaction() {
        var id = UUID.randomUUID();
        var expert = "sql-readonly-agent";
        var api = ready(id);
        when(store.hasResolutionColumns()).thenReturn(true);
        when(store.resolveUnknown(any(), anyString(), anyString(), anyString(), anyString(), anyString())).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return 1;
        });
        when(store.markTaskNeedsReview(any(), anyString())).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return 1;
        });
        var result = api.resolveUnknown(expert, id, "  " + NOTE + "  ");
        assertEquals(Map.of("run", Map.of("state", "closed-unconfirmed")), result);

        InOrder writes = inOrder(store);
        writes.verify(store).resolveUnknown(id, expert, "closed-unconfirmed", "unknown", NOTE,
                RuntimeWorkspace.OPERATOR_LABEL); // trimmed, not the raw request
        writes.verify(store).markTaskNeedsReview(id, "closed-unconfirmed");
        writes.verifyNoMoreInteractions();
    }
}
