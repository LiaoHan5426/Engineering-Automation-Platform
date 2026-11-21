package com.lh.eap.ai.graph;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * Pure graph operations over an immutable set of message nodes. No I/O, no framework.
 * These rules implement the branch contract in the chat redesign decision:
 * editing creates a new user node, regenerating creates a sibling assistant node, and
 * switching a branch is a read-only selection of an existing path.
 */
public final class MessageGraph {
    private MessageGraph() {}

    /**
     * Resolve the path from a leaf (exclusive or inclusive configurable) back to the root,
     * returned root-first. This is the exact path used to build model context or to display a
     * chosen branch; it never mutates the graph or any execution fact.
     *
     * @throws IllegalStateException if a cycle exists, a parent is missing, a node crosses
     *         conversations, or the leaf does not belong to the requested conversation.
     */
    public static List<ChatMessageNode> pathToRoot(
            UUID leafId, UUID conversationId, Function<UUID, ChatMessageNode> lookup) {
        ChatMessageNode leaf = lookup.apply(leafId);
        if (leaf == null) throw new IllegalStateException("leaf not found: " + leafId);
        if (!leaf.conversationId().equals(conversationId))
            throw new IllegalStateException("leaf belongs to a different conversation");

        Deque<ChatMessageNode> reversed = new ArrayDeque<>();
        Set<UUID> seen = new HashSet<>();
        ChatMessageNode cursor = leaf;
        while (cursor != null) {
            if (!seen.add(cursor.id())) throw new IllegalStateException("cycle in message graph at " + cursor.id());
            if (!cursor.conversationId().equals(conversationId))
                throw new IllegalStateException("node crosses conversation boundary: " + cursor.id());
            reversed.addFirst(cursor);
            if (cursor.parentId() == null) break;
            cursor = lookup.apply(cursor.parentId());
            if (cursor == null) throw new IllegalStateException("missing parent of " + reversed.getFirst().id());
        }
        return List.copyOf(reversed);
    }

    /**
     * Next sibling version to use when adding an alternative under {@code parentId}. It is one
     * past the highest existing sibling version; a null parent (root) is treated as a shared
     * sibling bucket too, so editing the first question creates a versioned alternative root
     * rather than clobbering it. Versions are never reused, so an old branch is never overwritten.
     */
    public static int nextSiblingVersion(UUID parentId, List<ChatMessageNode> existing) {
        int max = 0;
        for (ChatMessageNode node : existing) {
            if (java.util.Objects.equals(node.parentId(), parentId)) max = Math.max(max, node.version());
        }
        return max + 1;
    }

    /** Direct children of a parent (roots when parentId is null), sorted by version. */
    public static List<ChatMessageNode> children(UUID parentId, List<ChatMessageNode> all) {
        List<ChatMessageNode> out = new ArrayList<>();
        for (ChatMessageNode node : all) if (java.util.Objects.equals(node.parentId(), parentId)) out.add(node);
        out.sort((a, b) -> Integer.compare(a.version(), b.version()));
        return List.copyOf(out);
    }

    /** Sibling assistant nodes under the same user question - the candidates for regeneration. */
    public static List<ChatMessageNode> assistantAlternatives(
            ChatMessageNode userNode, List<ChatMessageNode> all) {
        List<ChatMessageNode> out = new ArrayList<>();
        for (ChatMessageNode node : all)
            if (node.role() == ChatMessageNode.Role.ASSISTANT && userNode.id().equals(node.parentId())) out.add(node);
        out.sort((a, b) -> Integer.compare(a.version(), b.version()));
        return List.copyOf(out);
    }

    /** Map convenience for building a lookup from a node list. */
    public static Function<UUID, ChatMessageNode> lookup(Map<UUID, ChatMessageNode> byId) {
        return byId::get;
    }
}
