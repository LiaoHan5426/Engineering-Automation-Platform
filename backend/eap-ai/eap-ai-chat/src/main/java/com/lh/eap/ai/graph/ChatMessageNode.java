package com.lh.eap.ai.graph;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * An immutable node in the chat message graph. Editing a question or regenerating an answer
 * appends a new node; existing nodes (and their execution evidence) are never mutated.
 *
 * <p>The {@code version} is the sibling index under the same parent - it is the branch identity,
 * not a mutable revision of this node. Root nodes (parentId null) also use versioning so editing
 * the first question creates a versioned alternative root instead of overwriting it.
 * {@code executionId} is only meaningful on assistant nodes and lets a reconnect observe the same
 * execution rather than starting a new generation.
 */
public record ChatMessageNode(
        UUID id,
        UUID conversationId,
        UUID parentId,
        Role role,
        int version,
        String text,
        String thinking,
        String citations,
        UUID executionId,
        long sequence,
        Instant createdAt) {

    public enum Role {
        USER, ASSISTANT;

        public String wire() {
            return name();
        }

        public static Role fromWire(String value) {
            if (value == null) return null;
            for (Role role : values()) if (role.name().equals(value)) return role;
            return null;
        }
    }

    public ChatMessageNode {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(conversationId, "conversationId");
        Objects.requireNonNull(role, "role");
        Objects.requireNonNull(createdAt, "createdAt");
        if (version < 1) throw new IllegalArgumentException("version must be >= 1");
        if (sequence < 1) throw new IllegalArgumentException("sequence must be >= 1");
        if (text == null || text.isEmpty()) throw new IllegalArgumentException("text is required");
        if (text.length() > 24000) throw new IllegalArgumentException("text exceeds 24000 chars");
        if (executionId != null && role != Role.ASSISTANT)
            throw new IllegalArgumentException("executionId is only valid on assistant nodes");
    }

    public boolean isRoot() {
        return parentId == null;
    }
}
