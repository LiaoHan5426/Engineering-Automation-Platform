package com.lh.eap.application.service;
import com.lh.eap.error.ExecutionErrors;

import java.util.Map;

/** Maps executor observations onto durable statuses only with process-tree termination evidence. */
public final class MissionRunOutcome {
    public record Outcome(String status, String projection, String exitEvidence, String unconfirmedReason, Integer exitCode) {
        public boolean terminal() {
            return unconfirmedReason == null;
        }
    }

    private MissionRunOutcome() {}

    public static Outcome from(String memoryStatus, Map<String, Object> metadata, boolean cancelRequested) {
        var facts = metadata == null ? Map.<String, Object>of() : metadata;
        var exited = Boolean.TRUE.equals(facts.get("processExited"));
        var notStarted = Boolean.TRUE.equals(facts.get("processNotStarted"));
        var code = facts.get("exitCode") instanceof Integer value ? value : null;
        if (Boolean.FALSE.equals(facts.get("processTreeCleanup"))) {
            return unconfirmed(ExecutionErrors.PROCESS_TREE_CLEANUP_UNCONFIRMED.code());
        }
        if (notStarted && !exited && !facts.containsKey("processPid")) {
            if (MissionExecutionStatus.FAILED.wire().equals(memoryStatus)) return terminal(MissionExecutionStatus.FAILED.wire(), "failed", "进程尚未启动", code);
            if (MissionExecutionStatus.CANCELLED.wire().equals(memoryStatus) || (cancelRequested && MissionExecutionStatus.CANCELLING.wire().equals(memoryStatus))) {
                return terminal(MissionExecutionStatus.CANCELLED.wire(), "cancelled", "进程尚未启动", code);
            }
            return unconfirmed(ExecutionErrors.EXECUTION_TERMINAL_UNCONFIRMED.code());
        }
        if (!exited) return unconfirmed(ExecutionErrors.PROCESS_EXIT_EVIDENCE_MISSING.code());
        if (!Boolean.TRUE.equals(facts.get("processTreeCleanup"))) return unconfirmed(ExecutionErrors.PROCESS_TREE_CLEANUP_UNCONFIRMED.code());
        if (MissionExecutionStatus.CANCELLED.wire().equals(memoryStatus) || (cancelRequested && MissionExecutionStatus.CANCELLING.wire().equals(memoryStatus))) {
            return terminal(MissionExecutionStatus.CANCELLED.wire(), "cancelled", "进程树已清理", code);
        }
        return completed(memoryStatus, code);
    }

    public static Outcome interrupted(String evidence) {
        if (evidence == null || evidence.isBlank()) {
            return unconfirmed(ExecutionErrors.PROCESS_EXIT_EVIDENCE_MISSING.code());
        }
        return terminal(MissionExecutionStatus.INTERRUPTED.wire(), "interrupted", evidence, null);
    }

    public static Outcome unconfirmed(String reason) {
        return new Outcome(null, null, null, reason, null);
    }

    private static Outcome completed(String memoryStatus, Integer code) {
        return switch (memoryStatus) {
            case "SUCCEEDED" -> terminal(MissionExecutionStatus.SUCCEEDED.wire(), "succeeded", "进程树已清理", code);
            case "FAILED" -> terminal(MissionExecutionStatus.FAILED.wire(), "failed", "进程树已清理", code);
            case "TIMED_OUT" -> terminal(MissionExecutionStatus.TIMED_OUT.wire(), "timed_out", "进程树已清理", code);
            default -> unconfirmed(ExecutionErrors.EXECUTION_TERMINAL_UNCONFIRMED.code());
        };
    }

    private static Outcome terminal(String status, String projection, String evidence, Integer code) {
        return new Outcome(status, projection, evidence, null, code);
    }
}
