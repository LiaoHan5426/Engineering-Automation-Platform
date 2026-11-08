package com.lh.eap.ai.dto;

import java.util.UUID;

/** Explicit recovery acknowledgement; a reset never restores model memory or binds a target. */
public record AiConversationReconnectResponse(UUID conversationId, String workspaceLabel, String memory,
        UUID connectionId, String connectionName, Long connectionRevision, String model, boolean contextReset) {}
