package com.lh.eap.ai.dto;

import java.time.Instant;
import java.util.UUID;

/** Normalized chat/execution event for SSE and snapshot replay. Bodies are already redacted. */
public record ChatExecutionEvent(
        UUID eventId,
        long sequence,
        UUID executionId,
        UUID conversationId,
        UUID taskId,
        String type,
        String protocolVersion,
        Instant occurredAt,
        String text,
        String code,
        String status,
        Object payload) {
    public static final String PROTOCOL_VERSION = "1";

    public static ChatExecutionEvent of(
            long sequence,
            UUID executionId,
            UUID conversationId,
            UUID taskId,
            String type,
            String text,
            String code,
            String status,
            Object payload) {
        return new ChatExecutionEvent(
                UUID.randomUUID(),
                sequence,
                executionId,
                conversationId,
                taskId,
                type,
                PROTOCOL_VERSION,
                Instant.now(),
                text == null ? "" : text,
                code == null ? "" : code,
                status == null ? "" : status,
                payload);
    }
}
