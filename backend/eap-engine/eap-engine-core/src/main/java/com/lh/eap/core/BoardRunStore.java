package com.lh.eap.core;

import java.util.List;
import java.util.UUID;

/**
 * Durable board task run rows. The task snapshot payload is a domain snapshot serialized as JSON
 * text by the caller; the adapter only moves that text to and from the JSONB column.
 */
public interface BoardRunStore {
    record Row(UUID requestId, long taskRevision, String taskSnapshotJson, UUID executionId) {}

    /** Newest runs first, at most 30. */
    List<Row> list(UUID taskId);

    /** Idempotency lookup by caller-supplied request id, at most one row. */
    List<Row> findByRequest(UUID taskId, UUID requestId);

    void insert(UUID executionId, UUID taskId, UUID requestId, long taskRevision, String taskSnapshotJson);
}
