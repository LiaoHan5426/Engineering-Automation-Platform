package com.lh.eap.application.service;

import java.time.Instant;
import java.util.UUID;

public record MissionExecution(
        UUID id,
        UUID missionId,
        String status,
        String capability,
        String principal,
        String workspacePath,
        String workspaceLabel,
        String executable,
        String policySnapshot,
        Long osPid,
        Instant processStartedAt,
        String processUser,
        String processExecutable,
        Instant startedAt,
        Instant finishedAt,
        Integer exitCode,
        String stdout,
        String stderr,
        String exitEvidence,
        String unconfirmedReason,
        boolean cancelRequested,
        String approval,
        Instant createdAt,
        Resolution resolution) {
    public MissionExecution {
        if (MissionExecutionStatus.fromWire(status) == MissionExecutionStatus.UNKNOWN)
            throw new IllegalArgumentException("Mission UNKNOWN is an observation; retain stored status and unconfirmedReason");
    }

    /** Convenience constructor for rows written before any human resolution. */
    public MissionExecution(UUID id, UUID missionId, String status, String capability, String principal,
                            String workspacePath, String workspaceLabel, String executable, String policySnapshot,
                            Long osPid, Instant processStartedAt, String processUser, String processExecutable,
                            Instant startedAt, Instant finishedAt, Integer exitCode, String stdout, String stderr,
                            String exitEvidence, String unconfirmedReason, boolean cancelRequested, String approval,
                            Instant createdAt) {
        this(id, missionId, status, capability, principal, workspacePath, workspaceLabel, executable, policySnapshot,
                osPid, processStartedAt, processUser, processExecutable, startedAt, finishedAt, exitCode, stdout, stderr,
                exitEvidence, unconfirmedReason, cancelRequested, approval, createdAt, null);
    }

    /** Human evidence-review audit. Never carries an executor exit claim. */
    public record Resolution(UUID executionId, String note, String operator, Instant resolvedAt) {}

    /**
     * Closes an unknown in-flight row after human evidence review. Every execution fact is retained
     * verbatim (including unconfirmedReason, exitCode=null and exitEvidence=null on an unknown row);
     * only status and the audit record change. This is not a process-exit or task-success claim.
     */
    public MissionExecution closeUnconfirmed(Resolution decision) {
        if (decision == null) throw new IllegalArgumentException("Resolution is required");
        if (!MissionExecutionStatus.fromWire(status).active())
            throw new IllegalArgumentException("Only an in-flight execution can be resolved");
        if (unconfirmedReason == null || unconfirmedReason.isBlank())
            throw new IllegalArgumentException("Only an unconfirmed execution can be resolved");
        return new MissionExecution(
                id, missionId, MissionExecutionStatus.CLOSED_UNCONFIRMED.wire(), capability, principal,
                workspacePath, workspaceLabel, executable, policySnapshot, osPid, processStartedAt,
                processUser, processExecutable, startedAt, finishedAt, exitCode, stdout, stderr,
                exitEvidence, unconfirmedReason, cancelRequested, approval, createdAt, decision);
    }
}
