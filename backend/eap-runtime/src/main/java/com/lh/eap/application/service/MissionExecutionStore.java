package com.lh.eap.application.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MissionExecutionStore {
    void insertOpen(MissionExecution execution);

    Optional<MissionExecution> open(UUID missionId);

    Optional<MissionExecution> find(UUID id);

    List<MissionExecution> list(UUID missionId);

    List<MissionExecution> openAll();

    void markCancelling(UUID id);

    void rememberProcess(UUID id, long pid, Instant startedAt, String user, String executable);

    void finish(UUID id, UUID missionId, String status, String projection, String evidence, Integer exitCode,
                String stdout, String stderr, boolean cancelRequested);

    void unconfirmed(UUID id, String reason);

    void failSameRow(UUID id, UUID missionId, String reason);
}
