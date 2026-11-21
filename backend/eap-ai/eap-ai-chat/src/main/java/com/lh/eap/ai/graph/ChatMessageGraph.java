package com.lh.eap.ai.graph;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Backend authority for sent chat messages (CT-02 slice C). Implementations persist an
 * append-only message graph; the browser never writes it directly and only reads a projection.
 *
 * <p>This is a domain port so the chat orchestration ({@code eap-ai-codegen}) can depend on it
 * without depending on a persistence technology. The JDBC implementation lives in the
 * application composition module. When no implementation is wired (unit tests, minimal
 * compositions), callers keep the pre-existing in-memory behaviour instead of failing.
 */
public interface ChatMessageGraph {
    /** Create the conversation root; binding metadata is display/rebuild only. */
    UUID createConversation(UUID conversationId, String workspacePath, String workspaceLabel,
            UUID connectionId, Long connectionRevision, String model, Instant now);

    /** Append an immutable node. Editing/regenerating append siblings; nothing is overwritten. */
    void appendNode(ChatMessageNode node);

    /** All nodes in a conversation, in stable sequence order. */
    List<ChatMessageNode> allInConversation(UUID conversationId);

    /** Highest-sequence node, i.e. the tip of the last linear append. */
    Optional<ChatMessageNode> lastNode(UUID conversationId);

    /** Next monotonic per-conversation sequence value. */
    long nextSequence(UUID conversationId);
}
