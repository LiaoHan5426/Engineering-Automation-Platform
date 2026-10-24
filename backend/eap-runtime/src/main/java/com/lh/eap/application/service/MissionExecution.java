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
        Instant createdAt) {}
