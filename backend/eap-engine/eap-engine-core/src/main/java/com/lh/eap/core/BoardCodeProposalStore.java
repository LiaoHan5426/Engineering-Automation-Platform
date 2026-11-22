package com.lh.eap.core;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Durable, task-bound code proposal reads for the board. */
public interface BoardCodeProposalStore {
    record Item(UUID id, UUID conversationId, UUID generationId, long taskRevision,
                String targetPath, String status, boolean writeAllowed, Instant createdAt, int fileCount) {}

    /**
     * Lists the newest rows for the exact task/project/workspace/operator binding, at most 21.
     * The 21st row, when present, is only the truncation marker.
     */
    List<Item> list(UUID taskId, String projectId, String workspace, String principal);

    /** Returns the conversation id bound to the proposal, or null when no such row exists. */
    UUID findConversationId(UUID taskId, String projectId, String workspace, String principal, UUID proposalId);
}
