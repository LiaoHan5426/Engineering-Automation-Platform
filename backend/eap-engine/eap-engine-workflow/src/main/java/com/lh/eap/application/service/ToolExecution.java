package com.lh.eap.application.service;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Durable operation snapshot; UNKNOWN continues to block duplicate execution. */
public record ToolExecution(UUID id, UUID requestId, String programId, String capabilityId,
        String workspacePath, String executable, String status, boolean cancelRequested,
        Instant createdAt, Instant finishedAt, Integer exitCode, String stdout, String stderr,
        boolean truncated, String exitEvidence, String unconfirmedReason, List<Step> steps, Resolution resolution) {
    public ToolExecution { steps = List.copyOf(steps); }
    /** Compatibility for historical snapshots and existing execution creation. */
    public ToolExecution(UUID id, UUID requestId, String programId, String capabilityId,
            String workspacePath, String executable, String status, boolean cancelRequested,
            Instant createdAt, Instant finishedAt, Integer exitCode, String stdout, String stderr,
            boolean truncated, String exitEvidence, String unconfirmedReason, List<Step> steps) {
        this(id, requestId, programId, capabilityId, workspacePath, executable, status, cancelRequested,
                createdAt, finishedAt, exitCode, stdout, stderr, truncated, exitEvidence, unconfirmedReason, steps, null);
    }
    /** Human attestation, never executor exit/cleanup evidence. */
    public record Resolution(UUID requestId, String note, String requestDigest, String operator,
                             Instant resolvedAt, boolean processTreeStopped) {}
    public ToolExecution closeUnknown(Resolution decision) {
        return new ToolExecution(id, requestId, programId, capabilityId, workspacePath, executable,
                "CLOSED_UNKNOWN", cancelRequested, createdAt, finishedAt, exitCode, stdout, stderr,
                truncated, exitEvidence, unconfirmedReason, steps, decision);
    }
    public record Step(UUID id, String phase, String status, List<String> command,
                       Map<String, Object> evidence) {
        public Step { command = List.copyOf(command); evidence = Map.copyOf(evidence); }
    }
    public boolean active() { return List.of("CREATED", "RUNNING", "CANCELLING").contains(status); }
    public boolean blocking() { return active() || "UNKNOWN".equals(status); }
    public ToolExecution state(String next, boolean cancel, Instant finished, Integer code,
            String out, String err, boolean clipped, String evidence, String unknown, List<Step> observations) {
        return new ToolExecution(id, requestId, programId, capabilityId, workspacePath, executable,
                next, cancel, createdAt, finished, code, out, err, clipped, evidence, unknown, observations, resolution);
    }
}
