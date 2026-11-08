package com.lh.eap.ai.dto;

import java.util.UUID;

public record AiConversationResponse(UUID conversationId, String workspaceLabel, String memory,
        UUID connectionId, String connectionName, Long connectionRevision, String model,
        com.lh.eap.ai.TaskWorkingMemory.Snapshot workingMemory) {
    public AiConversationResponse(UUID conversationId, String workspaceLabel, String memory,
            UUID connectionId, String connectionName, Long connectionRevision, String model) {
        this(conversationId, workspaceLabel, memory, connectionId, connectionName, connectionRevision, model, null);
    }
}
