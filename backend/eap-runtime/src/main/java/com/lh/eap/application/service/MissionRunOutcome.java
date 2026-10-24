package com.lh.eap.application.service;

import java.util.Map;

/** Maps an executor observation onto a durable status. Cancel and interrupt need exit evidence. */
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
        if ("CANCELLED".equals(memoryStatus) || (cancelRequested && "CANCELLING".equals(memoryStatus))) {
            if (notStarted) {
                return terminal("CANCELLED", "cancelled", "进程尚未启动", code);
            }
            if (!exited) {
                return unconfirmed("没有进程退出证据");
            }
            return terminal("CANCELLED", "cancelled", "进程已退出", code);
        }
        if (cancelRequested && ("SUCCEEDED".equals(memoryStatus) || "FAILED".equals(memoryStatus) || "TIMED_OUT".equals(memoryStatus))) {
            return completed(memoryStatus, exited, code);
        }
        return completed(memoryStatus, exited, code);
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

    private static Outcome completed(String memoryStatus, boolean exited, Integer code) {
        return switch (memoryStatus) {
            case "SUCCEEDED" -> terminal("SUCCEEDED", "succeeded", exited ? "进程已退出" : "退出码", code);
            case "FAILED" -> terminal("FAILED", "failed", exited ? "进程已退出" : "执行器拒绝", code);
            case "TIMED_OUT" -> exited
                    ? terminal("TIMED_OUT", "timed_out", "进程已退出", code)
                    : unconfirmed("超时但没有进程退出证据");
            default -> unconfirmed("无法确认终态");
        };
    }

    private static Outcome terminal(String status, String projection, String evidence, Integer code) {
        return new Outcome(status, projection, evidence, null, code);
    }
}
