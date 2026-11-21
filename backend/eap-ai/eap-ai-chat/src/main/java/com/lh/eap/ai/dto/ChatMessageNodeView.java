package com.lh.eap.ai.dto;

import java.util.List;
import java.util.UUID;

/**
 * Frontend projection of one immutable message node. Content is plain text/thinking only - no HTML,
 * no execution claims beyond the server-assigned executionId on assistant nodes.
 */
public record ChatMessageNodeView(
        UUID id,
        UUID parentId,
        String role,
        int version,
        String text,
        String thinking,
        String citations,
        String executionId,
        long sequence) {

    /** A selected branch path (root-first) plus all siblings, so the UI can offer alternatives. */
    public record GraphView(
            UUID conversationId,
            List<ChatMessageNodeView> path,
            List<ChatMessageNodeView> all) {}
}
