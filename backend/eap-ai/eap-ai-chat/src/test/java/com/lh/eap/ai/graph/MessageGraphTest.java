package com.lh.eap.ai.graph;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

class MessageGraphTest {
    private static final UUID CONV = UUID.randomUUID();
    private static final Instant T = Instant.parse("2026-11-21T00:00:00Z");

    private static ChatMessageNode node(
            UUID id, UUID parent, ChatMessageNode.Role role, int version, long seq, UUID execution) {
        return new ChatMessageNode(id, CONV, parent, role, version, "text-" + id, null, null, execution, seq, T);
    }

    @Test
    void rootNodesMayBeVersionedForEditedFirstQuestions() {
        assertDoesNotThrow(() -> node(UUID.randomUUID(), null, ChatMessageNode.Role.USER, 1, 1, null));
        assertDoesNotThrow(() -> node(UUID.randomUUID(), null, ChatMessageNode.Role.USER, 2, 2, null));
    }

    @Test
    void executionIdIsRejectedOnUserNodes() {
        assertThrows(IllegalArgumentException.class,
                () -> node(UUID.randomUUID(), UUID.randomUUID(), ChatMessageNode.Role.USER, 2, 2, UUID.randomUUID()));
    }

    @Test
    void pathToRootReturnsRootFirstAlongOneBranch() {
        UUID root = UUID.randomUUID();
        UUID q1 = UUID.randomUUID();
        UUID a1 = UUID.randomUUID();
        var nodes = List.of(
                node(root, null, ChatMessageNode.Role.USER, 1, 1, null),
                node(q1, root, ChatMessageNode.Role.ASSISTANT, 1, 2, UUID.randomUUID()),
                node(a1, q1, ChatMessageNode.Role.USER, 1, 3, null));
        Map<UUID, ChatMessageNode> byId = new HashMap<>();
        nodes.forEach(n -> byId.put(n.id(), n));

        List<ChatMessageNode> path = MessageGraph.pathToRoot(a1, CONV, MessageGraph.lookup(byId));
        assertEquals(List.of(root, q1, a1), path.stream().map(ChatMessageNode::id).toList());
    }

    @Test
    void switchingToSiblingBranchSelectsItsOwnPathWithoutTouchingTheOther() {
        UUID root = UUID.randomUUID();
        UUID answerV1 = UUID.randomUUID();
        UUID answerV2 = UUID.randomUUID();
        UUID followV2 = UUID.randomUUID();
        var nodes = List.of(
                node(root, null, ChatMessageNode.Role.USER, 1, 1, null),
                node(answerV1, root, ChatMessageNode.Role.ASSISTANT, 1, 2, UUID.randomUUID()),
                node(answerV2, root, ChatMessageNode.Role.ASSISTANT, 2, 3, UUID.randomUUID()),
                node(followV2, answerV2, ChatMessageNode.Role.USER, 1, 4, null));
        Map<UUID, ChatMessageNode> byId = new HashMap<>();
        nodes.forEach(n -> byId.put(n.id(), n));

        assertEquals(List.of(root, answerV1),
                MessageGraph.pathToRoot(answerV1, CONV, MessageGraph.lookup(byId)).stream().map(ChatMessageNode::id).toList());
        assertEquals(List.of(root, answerV2, followV2),
                MessageGraph.pathToRoot(followV2, CONV, MessageGraph.lookup(byId)).stream().map(ChatMessageNode::id).toList());
        // Selecting V2 does not remove or alter V1.
        assertEquals(4, byId.size());
        assertNotNull(byId.get(answerV1));
    }

    @Test
    void cycleAndCrossConversationAreRejected() {
        UUID a = UUID.randomUUID();
        UUID b = UUID.randomUUID();
        var nodes = List.of(node(a, b, ChatMessageNode.Role.USER, 1, 1, null),
                node(b, a, ChatMessageNode.Role.ASSISTANT, 1, 2, UUID.randomUUID()));
        Map<UUID, ChatMessageNode> byId = new HashMap<>();
        nodes.forEach(n -> byId.put(n.id(), n));
        assertThrows(IllegalStateException.class,
                () -> MessageGraph.pathToRoot(a, CONV, MessageGraph.lookup(byId)));

        UUID foreign = UUID.randomUUID();
        ChatMessageNode otherConv = new ChatMessageNode(foreign, CONV2(), null, ChatMessageNode.Role.USER,
                1, "x", null, null, null, 1, T);
        assertThrows(IllegalStateException.class,
                () -> MessageGraph.pathToRoot(foreign, CONV, (id) -> id.equals(foreign) ? otherConv : null));
    }

    @Test
    void nextSiblingVersionNeverReusesAnOldVersion() {
        UUID parent = UUID.randomUUID();
        var nodes = List.of(
                node(UUID.randomUUID(), parent, ChatMessageNode.Role.ASSISTANT, 1, 2, UUID.randomUUID()),
                node(UUID.randomUUID(), parent, ChatMessageNode.Role.ASSISTANT, 3, 5, UUID.randomUUID()));
        assertEquals(4, MessageGraph.nextSiblingVersion(parent, nodes));
        // no roots in this list -> first root version is 1; a present root bumps to 2
        assertEquals(1, MessageGraph.nextSiblingVersion(null, nodes));
        var withRoot = new java.util.ArrayList<>(nodes);
        withRoot.add(node(UUID.randomUUID(), null, ChatMessageNode.Role.USER, 1, 1, null));
        assertEquals(2, MessageGraph.nextSiblingVersion(null, withRoot));
    }

    @Test
    void assistantAlternativesAreSiblingsUnderTheSameQuestion() {
        UUID question = UUID.randomUUID();
        UUID unrelated = UUID.randomUUID();
        ChatMessageNode q = node(question, null, ChatMessageNode.Role.USER, 1, 1, null);
        var nodes = List.of(
                q,
                node(UUID.randomUUID(), question, ChatMessageNode.Role.ASSISTANT, 1, 2, UUID.randomUUID()),
                node(UUID.randomUUID(), question, ChatMessageNode.Role.ASSISTANT, 2, 3, UUID.randomUUID()),
                node(UUID.randomUUID(), unrelated, ChatMessageNode.Role.ASSISTANT, 1, 4, UUID.randomUUID()));
        assertEquals(2, MessageGraph.assistantAlternatives(q, nodes).size());
    }

    private static UUID CONV2() {
        return UUID.randomUUID();
    }
}
