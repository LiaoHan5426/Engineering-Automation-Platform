package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class MissionRunOutcomeTest {
    @Test
    void cancelledMemoryStatusWithoutProcessExitStaysUnconfirmed() {
        var outcome = MissionRunOutcome.from("CANCELLED", Map.of("processExited", false, "processNotStarted", false), true);
        assertFalse(outcome.terminal());
        assertEquals("没有进程退出证据", outcome.unconfirmedReason());
    }

    @Test
    void cancelledAfterObservedExitIsTerminal() {
        var outcome = MissionRunOutcome.from("CANCELLED", Map.of("processExited", true, "processTreeCleanup", true, "exitCode", 130), true);
        assertTrue(outcome.terminal());
        assertEquals("CANCELLED", outcome.status());
        assertEquals("进程树已清理", outcome.exitEvidence());
    }

    @ParameterizedTest
    @ValueSource(strings = {"SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELLING"})
    void parentExitWithFailedTreeCleanupNeverConfirmsTermination(String status) {
        var outcome = MissionRunOutcome.from(status, Map.of("processExited", true,
                "processNotStarted", false, "processTreeCleanup", false, "exitCode", -1), true);
        assertFalse(outcome.terminal());
        assertEquals("进程树清理未确认", outcome.unconfirmedReason());
    }

    @ParameterizedTest
    @ValueSource(strings = {"SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED"})
    void parentExitAloneIsNotTreeExitEvidence(String status) {
        assertFalse(MissionRunOutcome.from(status, Map.of("processExited", true), false).terminal());
    }

    @Test
    void failureWithoutAnyProcessEvidenceStaysUnconfirmed() {
        assertFalse(MissionRunOutcome.from("FAILED", Map.of(), false).terminal());
    }

    @Test
    void confirmedFailureBeforeStartCanFinish() {
        var outcome = MissionRunOutcome.from("FAILED", Map.of("processNotStarted", true, "exitCode", -1), false);
        assertTrue(outcome.terminal());
        assertEquals("FAILED", outcome.status());
        assertEquals("进程尚未启动", outcome.exitEvidence());
    }

    @Test
    void interruptWithoutEvidenceIsRejected() {
        var outcome = MissionRunOutcome.interrupted("  ");
        assertFalse(outcome.terminal());
    }
}
