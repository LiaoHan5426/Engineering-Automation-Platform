package com.lh.eap.ai.graph;

import com.lh.eap.ai.graph.ChatMessageNode.Role;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Application-level append operations over the message graph. Pure with respect to the
 * persistence technology: it only needs the {@link ChatMessageGraph} port, so editing/regenerating
 * invariants can be unit-tested without a database. All writes are immutable appends - an edit or
 * regeneration never overwrites an existing node or its execution evidence.
 *
 * <p>Callers must serialize appends per conversation (the chat application already holds an
 * exclusive per-conversation lock), so sequence/version allocation is safe in a single operator
 * deployment.
 */
public final class MessageGraphWriter {
    public static final int MAX_TEXT = 24000;
    private static final String EMPTY = " ";

    private final ChatMessageGraph store;
    private final java.util.function.Supplier<Instant> clock;

    public MessageGraphWriter(ChatMessageGraph store) {
        this(store, Instant::now);
    }

    public MessageGraphWriter(ChatMessageGraph store, java.util.function.Supplier<Instant> clock) {
        this.store = java.util.Objects.requireNonNull(store, "store");
        this.clock = java.util.Objects.requireNonNull(clock, "clock");
    }

    public record TurnIds(UUID userNodeId, UUID assistantNodeId) {}

    /** Append a normal question/answer pair at the current tip of the conversation. */
    public TurnIds appendTurn(UUID conversationId, String question, String answer, UUID executionId,
            String answerFallback) {
        var tip = store.lastNode(conversationId);
        UUID parent = tip.map(ChatMessageNode::id).orElse(null);
        return appendUnder(conversationId, parent, question, answer, executionId, answerFallback);
    }

    /**
     * Edit a question: append a NEW user node as a sibling under the edited node's parent, with its
     * own answer. The old question/answer branch stays intact. Returns the new node ids.
     */
    public TurnIds editTurn(UUID conversationId, UUID editedUserNodeId, String newQuestion, String answer,
            UUID executionId, String answerFallback) {
        var edited = require(conversationId, editedUserNodeId);
        if (edited.role() != Role.USER)
            throw new IllegalArgumentException("edit target must be a USER node");
        return appendUnder(conversationId, edited.parentId(), newQuestion, answer, executionId, answerFallback);
    }

    /**
     * Regenerate an answer: append a NEW assistant node as a sibling under the same question, tied
     * to a fresh execution. The previous answer and its execution stay intact. Returns the new id.
     */
    public UUID regenerate(UUID conversationId, UUID userNodeId, String answer, UUID executionId,
            String answerFallback) {
        var question = require(conversationId, userNodeId);
        if (question.role() != Role.USER)
            throw new IllegalArgumentException("regenerate target must be a USER node");
        List<ChatMessageNode> all = store.allInConversation(conversationId);
        int version = MessageGraph.nextSiblingVersion(question.id(), all);
        long seq = store.nextSequence(conversationId);
        UUID id = UUID.randomUUID();
        store.appendNode(new ChatMessageNode(id, conversationId, question.id(), Role.ASSISTANT, version,
                bound(answer, answerFallback), null, null, executionId, seq, clock.get()));
        return id;
    }

    private TurnIds appendUnder(UUID conversationId, UUID parent, String question, String answer,
            UUID executionId, String answerFallback) {
        List<ChatMessageNode> all = store.allInConversation(conversationId);
        long seq = store.nextSequence(conversationId);
        Instant now = clock.get();
        UUID userId = UUID.randomUUID();
        store.appendNode(new ChatMessageNode(userId, conversationId, parent, Role.USER,
                MessageGraph.nextSiblingVersion(parent, all), bound(question, EMPTY), null, null, null, seq, now));
        UUID assistantId = UUID.randomUUID();
        store.appendNode(new ChatMessageNode(assistantId, conversationId, userId, Role.ASSISTANT, 1,
                bound(answer, answerFallback), null, null, executionId, seq + 1, now));
        return new TurnIds(userId, assistantId);
    }

    private ChatMessageNode require(UUID conversationId, UUID nodeId) {
        var node = store.allInConversation(conversationId).stream()
                .filter(n -> n.id().equals(nodeId)).findFirst();
        if (node.isEmpty()) throw new IllegalArgumentException("node not found in conversation: " + nodeId);
        return node.get();
    }

    /** DDL requires a non-empty text bounded to 24000 chars; never fabricate tool/HTML content. */
    static String bound(String text, String fallback) {
        String value = text == null || text.isEmpty() ? fallback : text;
        if (value == null || value.isEmpty()) value = EMPTY;
        return value.length() > MAX_TEXT ? value.substring(0, MAX_TEXT) : value;
    }
}
