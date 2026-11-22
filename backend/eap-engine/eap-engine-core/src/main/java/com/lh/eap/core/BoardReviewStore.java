package com.lh.eap.core;

import java.util.Optional;
import java.util.UUID;

/** Durable review snapshot attachment for a board task run. */
public interface BoardReviewStore {
    record SnapshotRow(String json) {}

    /** A present row with null JSON means the run exists but has not been reviewed yet. */
    Optional<SnapshotRow> findSnapshot(UUID taskId, UUID executionId);

    /** Idempotent write: an existing snapshot is never overwritten. */
    void saveSnapshotIfAbsent(String json, UUID taskId, UUID executionId);
}
