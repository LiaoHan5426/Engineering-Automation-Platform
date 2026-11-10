package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

class BoardCodeWorkspaceInterlockTest {
    @Test void sharedBoardLockRejectsDurableCodeIntentForRunVerificationReviewAndDelivery() {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(contains("eap.code_proposal"), eq(Boolean.class), eq("workspace"), eq(com.lh.eap.persistence.mapper.StateBindings.CODE_BLOCKING))).thenReturn(true);
        var tasks = new BoardTaskService(jdbc);
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            assertEquals("CODE_WORKSPACE_BUSY", assertThrows(ResponseStatusException.class,
                    () -> tasks.lockWorkspace("workspace")).getReason());
            assertTrue(tasks.hasActiveWorkspace("workspace"));
            assertTrue(tasks.hasActiveVerification("workspace"));
        } finally { TransactionSynchronizationManager.setActualTransactionActive(false); }
    }
}
