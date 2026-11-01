package com.lh.eap.ai.dto;

import java.util.UUID;

public record AiConversationResponse(UUID conversationId, String workspaceLabel, String memory,
        UUID connectionId, String connectionName, Long connectionRevision, String model) {}
