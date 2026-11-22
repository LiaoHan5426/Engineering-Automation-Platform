package com.lh.eap.core;

import java.util.Optional;
import java.util.UUID;

/** Durable immutable verification identity attached to a board task run. */
public interface BoardVerificationStore {
    record SnapshotRow(String json) {}

    /** A present row with null JSON means the run exists but has no verification identity yet. */
    Optional<SnapshotRow> findSnapshot(UUID taskId, UUID executionId);

    boolean saveIfAbsent(String json, UUID taskId, UUID executionId);

    boolean saveIfStatus(String json, UUID taskId, UUID executionId, String expectedStatus);

    boolean markPassedUnknown(UUID taskId, UUID executionId, String reason);

    void markUnknown(UUID taskId, UUID executionId, String reason);

    void markRestartUnknown(String reason);
}
