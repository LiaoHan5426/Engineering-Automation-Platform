package com.lh.eap.core;

import java.util.List;
import java.util.UUID;

/** Durable link between a board task and an immutable prototype version. */
public interface BoardPrototypeSelectionStore {
    void linkVersion(UUID taskId, String projectId, UUID versionId, List<String> events);
}
