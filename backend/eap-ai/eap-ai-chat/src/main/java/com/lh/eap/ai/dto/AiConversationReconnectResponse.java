package com.lh.eap.ai.dto;

import java.util.UUID;
import com.lh.eap.ai.TaskWorkingMemory;

/** One explicit recovery and target-binding acknowledgement. UI history is never replayed. */
public record AiConversationReconnectResponse(UUID conversationId, String workspaceLabel, String memory,
        UUID connectionId, String connectionName, Long connectionRevision, String model, boolean contextReset,
        boolean memoryCleared, TaskWorkingMemory.Snapshot workingMemory) {}
