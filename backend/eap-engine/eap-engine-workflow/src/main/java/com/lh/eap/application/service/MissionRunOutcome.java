package com.lh.eap.application.service;

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
            return unconfirmed("进程树清理未确认");
        }
        if (notStarted && !exited && !facts.containsKey("processPid")) {
            if ("FAILED".equals(memoryStatus)) return terminal("FAILED", "failed", "进程尚未启动", code);
            if ("CANCELLED".equals(memoryStatus) || (cancelRequested && "CANCELLING".equals(memoryStatus))) {
                return terminal("CANCELLED", "cancelled", "进程尚未启动", code);
            }
            return unconfirmed("无法确认终态");
        }
        if (!exited) return unconfirmed("没有进程退出证据");
        if (!Boolean.TRUE.equals(facts.get("processTreeCleanup"))) return unconfirmed("进程树清理未确认");
        if ("CANCELLED".equals(memoryStatus) || (cancelRequested && "CANCELLING".equals(memoryStatus))) {
            return terminal("CANCELLED", "cancelled", "进程树已清理", code);
        }
        return completed(memoryStatus, code);
    }

    public static Outcome interrupted(String evidence) {
        if (evidence == null || evidence.isBlank()) {
            return unconfirmed("没有进程退出证据");
        }
        return terminal("INTERRUPTED", "interrupted", evidence, null);
    }

    public static Outcome unconfirmed(String reason) {
        return new Outcome(null, null, null, reason, null);
    }

    private static Outcome completed(String memoryStatus, Integer code) {
        return switch (memoryStatus) {
            case "SUCCEEDED" -> terminal("SUCCEEDED", "succeeded", "进程树已清理", code);
            case "FAILED" -> terminal("FAILED", "failed", "进程树已清理", code);
            case "TIMED_OUT" -> terminal("TIMED_OUT", "timed_out", "进程树已清理", code);
            default -> unconfirmed("无法确认终态");
        };
    }

    private static Outcome terminal(String status, String projection, String evidence, Integer code) {
        return new Outcome(status, projection, evidence, null, code);
    }
}
