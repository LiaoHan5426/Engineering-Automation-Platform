package com.lh.eap.ai.dto;

import java.util.List;
import java.util.UUID;

public record ChatExecutionSnapshot(
        UUID executionId,
        UUID conversationId,
        long latestSequence,
        boolean complete,
        String status,
        List<ChatExecutionEvent> events) {}
