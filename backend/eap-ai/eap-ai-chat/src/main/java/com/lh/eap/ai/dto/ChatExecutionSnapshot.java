package com.lh.eap.ai.dto;
import com.lh.eap.ai.ChatExecutionStatus;

import java.util.List;
import java.util.UUID;

public record ChatExecutionSnapshot(
        UUID executionId,
        UUID conversationId,
        long latestSequence,
        boolean complete,
        String status,
        List<ChatExecutionEvent> events) {
    public ChatExecutionSnapshot { ChatExecutionStatus.fromWire(status); }
}
