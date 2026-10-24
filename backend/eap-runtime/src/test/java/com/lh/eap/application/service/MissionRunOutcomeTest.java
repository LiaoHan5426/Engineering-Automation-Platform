package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;

class MissionRunOutcomeTest {
    @Test
    void cancelledMemoryStatusWithoutProcessExitStaysUnconfirmed() {
        var outcome = MissionRunOutcome.from("CANCELLED", Map.of("processExited", false, "processNotStarted", false), true);
        assertFalse(outcome.terminal());
        assertEquals("没有进程退出证据", outcome.unconfirmedReason());
    }

    @Test
    void cancelledAfterObservedExitIsTerminal() {
        var outcome = MissionRunOutcome.from("CANCELLED", Map.of("processExited", true, "exitCode", 130), true);
        assertTrue(outcome.terminal());
        assertEquals("CANCELLED", outcome.status());
        assertEquals("进程已退出", outcome.exitEvidence());
    }

    @Test
    void interruptWithoutEvidenceIsRejected() {
        var outcome = MissionRunOutcome.interrupted("  ");
        assertFalse(outcome.terminal());
    }
}
