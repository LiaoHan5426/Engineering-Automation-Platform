package com.lh.eap.application.dto;

import java.util.UUID;

public record AiConnectionAssignment(UUID conversationId, UUID connectionId, String connectionName, String model,
        String endpoint, long revision, boolean memoryCleared) {}
