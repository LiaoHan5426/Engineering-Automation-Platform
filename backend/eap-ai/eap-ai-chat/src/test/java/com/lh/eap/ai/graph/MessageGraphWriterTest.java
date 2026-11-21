package com.lh.eap.ai.graph;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.ai.graph.ChatMessageNode.Role;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class MessageGraphWriterTest {
    /** In-memory port: append-only, mirrors the DB invariants that matter to the writer. */
    static class MemoryGraph implements ChatMessageGraph {
        final List<ChatMessageNode> nodes = new ArrayList<>();
        public UUID createConversation(UUID id, String wp, String wl, UUID cid, Long rev, String model, Instant now) { return id; }
        public void appendNode(ChatMessageNode node) {
            boolean dupVersion = nodes.stream().anyMatch(n ->
                    java.util.Objects.equals(n.parentId(), node.parentId())
                            && n.version() == node.version());
            if (dupVersion) throw new IllegalStateException("duplicate sibling version");
            nodes.add(node);
        }
        public List<ChatMessageNode> allInConversation(UUID id) {
            return nodes.stream().sorted(Comparator.comparingLong(ChatMessageNode::sequence)).toList();
        }
        public Optional<ChatMessageNode> lastNode(UUID id) {
            return nodes.stream().max(Comparator.comparingLong(ChatMessageNode::sequence));
        }
        public long nextSequence(UUID id) {
            return nodes.stream().mapToLong(ChatMessageNode::sequence).max().orElse(0) + 1;
        }
    }

    @Test
    void appendTurnCreatesRootQuestionAndAssistantWithExecution() {
        var store = new MemoryGraph();
        var writer = new MessageGraphWriter(store);
        UUID conv = UUID.randomUUID();
        UUID exec = UUID.randomUUID();
        var ids = writer.appendTurn(conv, "question", "answer", exec, "fallback");

        assertEquals(2, store.nodes.size());
        var user = store.nodes.stream().filter(n -> n.id().equals(ids.userNodeId())).findFirst().orElseThrow();
        var assistant = store.nodes.stream().filter(n -> n.id().equals(ids.assistantNodeId())).findFirst().orElseThrow();
        assertEquals(Role.USER, user.role());
        assertNull(user.parentId());
        assertEquals(1, user.version());
        assertNull(user.executionId());
        assertEquals(Role.ASSISTANT, assistant.role());
        assertEquals(user.id(), assistant.parentId());
        assertEquals(1, assistant.version());
        assertEquals(exec, assistant.executionId());
        assertEquals(2, assistant.sequence());
    }

    @Test
    void secondTurnAttachesToPreviousAssistantTip() {
        var store = new MemoryGraph();
        var writer = new MessageGraphWriter(store);
        UUID conv = UUID.randomUUID();
        var first = writer.appendTurn(conv, "q1", "a1", UUID.randomUUID(), "f");
        var second = writer.appendTurn(conv, "q2", "a2", UUID.randomUUID(), "f");

        var secondUser = store.nodes.stream().filter(n -> n.id().equals(second.userNodeId())).findFirst().orElseThrow();
        assertEquals(first.assistantNodeId(), secondUser.parentId());
        assertEquals(3, secondUser.sequence());
        // path to the second answer includes all four nodes, root-first
        var path = com.lh.eap.ai.graph.MessageGraph.pathToRoot(second.assistantNodeId(), conv, store.nodes.stream()
                .collect(java.util.stream.Collectors.toMap(ChatMessageNode::id, n -> n))::get);
        assertEquals(4, path.size());
    }

    @Test
    void editCreatesSiblingUserBranchAndKeepsOldBranch() {
        var store = new MemoryGraph();
        var writer = new MessageGraphWriter(store);
        UUID conv = UUID.randomUUID();
        var first = writer.appendTurn(conv, "original", "a1", UUID.randomUUID(), "f");
        var edited = writer.editTurn(conv, first.userNodeId(), "edited", "a2", UUID.randomUUID(), "f");

        var editedUser = store.nodes.stream().filter(n -> n.id().equals(edited.userNodeId())).findFirst().orElseThrow();
        // edited question is a sibling of the original root question (same null parent), version 2
        assertNull(editedUser.parentId());
        assertEquals(2, editedUser.version());
        // original branch still intact
        assertEquals(4, store.nodes.size());
        assertEquals("original", store.nodes.stream().filter(n -> n.id().equals(first.userNodeId())).findFirst().orElseThrow().text());
    }

    @Test
    void regenerateCreatesSiblingAssistantUnderSameQuestion() {
        var store = new MemoryGraph();
        var writer = new MessageGraphWriter(store);
        UUID conv = UUID.randomUUID();
        UUID exec2 = UUID.randomUUID();
        var first = writer.appendTurn(conv, "q", "a1", UUID.randomUUID(), "f");
        var regenerated = writer.regenerate(conv, first.userNodeId(), "a2", exec2, "f");

        var regen = store.nodes.stream().filter(n -> n.id().equals(regenerated)).findFirst().orElseThrow();
        assertEquals(Role.ASSISTANT, regen.role());
        assertEquals(first.userNodeId(), regen.parentId());
        assertEquals(2, regen.version());
        assertEquals(exec2, regen.executionId());
        // first answer untouched
        assertEquals("a1", store.nodes.stream().filter(n -> n.id().equals(first.assistantNodeId())).findFirst().orElseThrow().text());
    }

    @Test
    void textIsBoundedAndNeverEmpty() {
        assertEquals("fallback", MessageGraphWriter.bound("", "fallback"));
        assertEquals("fallback", MessageGraphWriter.bound(null, "fallback"));
        assertEquals(" ", MessageGraphWriter.bound("", ""));
        String huge = "x".repeat(MessageGraphWriter.MAX_TEXT + 100);
        assertEquals(MessageGraphWriter.MAX_TEXT, MessageGraphWriter.bound(huge, "f").length());
    }

    @Test
    void editRejectsAssistantTarget() {
        var store = new MemoryGraph();
        var writer = new MessageGraphWriter(store);
        UUID conv = UUID.randomUUID();
        var first = writer.appendTurn(conv, "q", "a", UUID.randomUUID(), "f");
        assertThrows(IllegalArgumentException.class,
                () -> writer.editTurn(conv, first.assistantNodeId(), "x", "y", UUID.randomUUID(), "f"));
    }
}
