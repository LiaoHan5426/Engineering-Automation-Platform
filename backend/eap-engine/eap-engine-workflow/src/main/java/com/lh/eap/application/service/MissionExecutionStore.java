package com.lh.eap.application.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MissionExecutionStore {
    void insertOpen(MissionExecution execution);

    /** Atomically claim a queued run; unknown/recovered rows must never be launched again. */
    boolean claimCreated(UUID id);

    Optional<MissionExecution> open(UUID missionId);

    Optional<MissionExecution> find(UUID id);

    List<MissionExecution> list(UUID missionId);

    List<MissionExecution> openAll();

    void markCancelling(UUID id);

    void rememberProcess(UUID id, long pid, Instant startedAt, String user, String executable);

    void finish(UUID id, UUID missionId, String status, String projection, String evidence, Integer exitCode,
                String stdout, String stderr, boolean cancelRequested);

    void unconfirmed(UUID id, String reason);

    /**
     * Conditionally close an unconfirmed in-flight row with human-review audit. Returns the number
     * of rows updated: 1 on success, 0 if the row is already terminal, not unconfirmed, or resolved.
     * Never writes exit_code/exit_evidence or claims process termination.
     */
    int resolveUnconfirmed(UUID id, String note, String operator, Instant resolvedAt);

    void failSameRow(UUID id, UUID missionId, String reason);
}
