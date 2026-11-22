package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import com.lh.eap.domain.model.MissionExecution;
import com.lh.eap.domain.model.MissionExecutionStatus;

class MissionExecutionResolutionTest {
    private static final Instant NOW = Instant.parse("2026-11-21T10:00:00Z");

    @Test
    void unresolvedUnknownStatusIsRejectedByConstructor() {
        var id = UUID.randomUUID();
        assertThrows(IllegalArgumentException.class,
                () -> new MissionExecution(id, UUID.randomUUID(), "UNKNOWN", "git-status", "local-operator",
                        "/ws", "label", "git", "policy", null, null, null, null, NOW, null, null, null, null,
                        null, "reason", false, "NOT_REQUIRED", NOW));
    }

    @Test
    void newTerminalIsNeitherActiveNorBlocking() {
        assertFalse(MissionExecutionStatus.CLOSED_UNCONFIRMED.active());
        assertFalse(MissionExecutionStatus.CLOSED_UNCONFIRMED.blocking());
        assertTrue(MissionExecutionStatus.UNKNOWN.blocking());
    }

    @Test
    void closeUnconfirmedRetainsEveryExecutionFactAndAddsAudit() {
        var row = unknownRow();
        var resolved = row.closeUnconfirmed(new MissionExecution.Resolution(row.id(), "Reviewed logs", "local-operator", NOW));

        assertEquals(MissionExecutionStatus.CLOSED_UNCONFIRMED.wire(), resolved.status());
        assertEquals(row.unconfirmedReason(), resolved.unconfirmedReason());
        assertNull(resolved.exitCode());
        assertNull(resolved.exitEvidence());
        assertEquals(row.id(), resolved.id());
        assertEquals(row.startedAt(), resolved.startedAt());
        assertEquals(row.cancelRequested(), resolved.cancelRequested());
        assertEquals(row.createdAt(), resolved.createdAt());
        assertEquals("Reviewed logs", resolved.resolution().note());
        assertEquals("local-operator", resolved.resolution().operator());
        assertEquals(NOW, resolved.resolution().resolvedAt());
        // The source row is immutable; resolution returns a new value.
        assertEquals("RUNNING", row.status());
    }

    @Test
    void closeUnconfirmedRequiresUnknownInFlightRow() {
        var resolved = unknownRow().closeUnconfirmed(new MissionExecution.Resolution(
                UUID.randomUUID(), "Reviewed logs", "local-operator", NOW));
        assertThrows(IllegalArgumentException.class,
                () -> resolved.closeUnconfirmed(new MissionExecution.Resolution(
                        UUID.randomUUID(), "Reviewed again", "local-operator", NOW)));
        var terminal = new MissionExecution(UUID.randomUUID(), UUID.randomUUID(), "SUCCEEDED", "git-status",
                "local-operator", "/ws", "label", "git", "policy", null, null, null, null, NOW, NOW, 0, "", "",
                "tree cleaned", null, false, "NOT_REQUIRED", NOW);
        assertThrows(IllegalArgumentException.class,
                () -> terminal.closeUnconfirmed(new MissionExecution.Resolution(
                        UUID.randomUUID(), "Reviewed logs", "local-operator", NOW)));
        var inFlightButConfirmed = new MissionExecution(UUID.randomUUID(), UUID.randomUUID(), "RUNNING", "git-status",
                "local-operator", "/ws", "label", "git", "policy", 42L, NOW, "op", "git", NOW, null, null, null, null,
                null, null, false, "NOT_REQUIRED", NOW);
        assertThrows(IllegalArgumentException.class,
                () -> inFlightButConfirmed.closeUnconfirmed(new MissionExecution.Resolution(
                        UUID.randomUUID(), "Reviewed logs", "local-operator", NOW)));
    }

    private static MissionExecution unknownRow() {
        return new MissionExecution(UUID.randomUUID(), UUID.randomUUID(), "RUNNING", "git-status", "local-operator",
                "/ws", "label", "git", "policy", 42L, NOW, "op", "git", NOW, null, null, null, null,
                null, "SERVICE_RESTART_EXIT_UNCONFIRMED", false, "NOT_REQUIRED", NOW);
    }
}
