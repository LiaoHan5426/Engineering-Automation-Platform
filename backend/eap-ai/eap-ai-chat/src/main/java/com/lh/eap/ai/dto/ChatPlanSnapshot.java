package com.lh.eap.ai.dto;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
public record ChatPlanSnapshot(int schemaVersion, UUID planId, UUID conversationId, UUID executionId,
        long revision, Instant updatedAt, List<Item> items) {
    public ChatPlanSnapshot { items = List.copyOf(items); }
    public record Item(UUID id, String content, String status) {}
}
