package com.lh.eap.ai;

import java.util.Optional;
import java.util.UUID;

/** Local persistence for task working memory snapshots. Never stores model ChatMemory. */
public interface WorkingMemoryStore {
    void save(UUID conversationId, TaskWorkingMemory.Snapshot snapshot);

    Optional<TaskWorkingMemory.Snapshot> load(UUID conversationId);

    void delete(UUID conversationId);
}
