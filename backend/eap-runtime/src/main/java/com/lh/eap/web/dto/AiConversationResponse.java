package com.lh.eap.web.dto;

import java.util.UUID;

public record AiConversationResponse(UUID conversationId, String workspaceLabel, String memory,
        UUID connectionId, String connectionName, Long connectionRevision, String model) {}
