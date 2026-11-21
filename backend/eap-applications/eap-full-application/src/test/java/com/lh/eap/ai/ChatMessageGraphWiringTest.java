package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.ai.graph.ChatMessageGraph;
import com.lh.eap.ai.graph.ChatMessageNode;
import com.lh.eap.ai.dto.ChatMessageNodeView;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;

/** Verifies AiChatApplication wires the optional message-graph port for sent messages (CT-02 C1). */
class ChatMessageGraphWiringTest {
    @TempDir Path root;

    static class MemoryGraph implements ChatMessageGraph {
        final List<ChatMessageNode> nodes = new ArrayList<>();
        final List<UUID> conversations = new ArrayList<>();
        public UUID createConversation(UUID id, String wp, String wl, UUID cid, Long rev, String model, Instant now) {
            conversations.add(id); return id;
        }
        public void appendNode(ChatMessageNode node) { nodes.add(node); }
        public List<ChatMessageNode> allInConversation(UUID id) {
            return nodes.stream().filter(n -> n.conversationId().equals(id))
                    .sorted(Comparator.comparingLong(ChatMessageNode::sequence)).toList();
        }
        public Optional<ChatMessageNode> lastNode(UUID id) {
            return allInConversation(id).stream().max(Comparator.comparingLong(ChatMessageNode::sequence));
        }
        public long nextSequence(UUID id) {
            return allInConversation(id).stream().mapToLong(ChatMessageNode::sequence).max().orElse(0) + 1;
        }
    }

    private AiChatApplication app(ChatMessageGraph graph) {
        var handlers = new CapabilityHandlerRegistry(List.of());
        var status = new AiConnectionStatus(handlers, root, null, "none", "offline-model",
                "https://api.openai.com", false);
        var memory = org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().maxMessages(20).build();
        var chat = new EngineeringChatService(null, handlers, (Path) null,
                new FileExecutionArtifactStore(root.resolve("artifacts")));
        var app = new AiChatApplication(status, new AiConversationRegistry(memory), chat, root);
        if (graph != null) ReflectionTestUtils.setField(app, "messageGraph", graph);
        return app;
    }

    @Test
    void openCreatesGraphRootAndSuccessfulSendAppendsQuestionAnswerPair() {
        var graph = new MemoryGraph();
        var app = app(graph);
        // No model configured -> send would be rejected; use a fake model app instead (below).
        // Here we only assert open created the graph root.
        var id = app.open("{}").conversationId();
        assertEquals(List.of(id), graph.conversations);
        assertTrue(graph.allInConversation(id).isEmpty());
    }

    private AiChatApplication appWithModel(ChatMessageGraph graph) {
        var handlers = new CapabilityHandlerRegistry(List.of());
        var connections = new ModelConnections(root.resolve("graph-conn-" + UUID.randomUUID() + ".json"), true, new ModelClientSource() {
            public org.springframework.ai.chat.client.ChatClient conversational(ModelConnectionSnapshot snapshot) {
                return org.springframework.ai.chat.client.ChatClient.builder(
                        FakeChatModels.scripted(p -> FakeChatModels.text("graph answer"))).build();
            }
            public org.springframework.ai.chat.client.ChatClient completion(ModelConnectionSnapshot snapshot) {
                return conversational(snapshot);
            }
        });
        var saved = connections.create("desk", "https://127.0.0.1:9/v1", "k", true, true, "chat-completions");
        connections.configureModels(saved.id(), List.of(new ModelOption("m", List.of())), List.of("m"), "m");
        var status = new AiConnectionStatus(handlers, root, null, "none", "offline-model",
                "https://api.openai.com", false, connections);
        var memory = org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().maxMessages(20).build();
        var chat = new EngineeringChatService(null, handlers, (Path) null,
                new FileExecutionArtifactStore(root.resolve("artifacts-" + UUID.randomUUID())));
        var app = new AiChatApplication(status, new AiConversationRegistry(memory), chat, root, connections);
        ReflectionTestUtils.setField(app, "messageGraph", graph);
        return app;
    }

    @Test
    void successfulSendAppendsPairAndGraphReadsSelectedPath() {
        var graph = new MemoryGraph();
        var app = appWithModel(graph);
        var id = app.open("{}").conversationId();
        var result = app.send(id, "{\"message\":\"graph question\",\"toolMode\":\"none\"}");
        assertEquals("graph answer", result.answer());

        var nodes = graph.allInConversation(id);
        assertEquals(2, nodes.size());
        assertEquals("graph question", nodes.get(0).text());
        assertEquals("graph answer", nodes.get(1).text());
        assertEquals(ChatMessageNode.Role.ASSISTANT, nodes.get(1).role());
        assertEquals(result.executionId().toString(), nodes.get(1).executionId().toString());

        ChatMessageNodeView.GraphView view = app.conversationGraph(id, null);
        assertEquals(2, view.path().size());
        assertEquals("graph question", view.path().get(0).text());
        assertEquals("graph answer", view.path().get(1).text());
        assertEquals(2, view.all().size());
    }

    @Test
    void editMessageAppendsVersionedQuestionBranchKeepsOldNodes() {
        var graph = new MemoryGraph();
        var app = appWithModel(graph);
        var id = app.open("{}").conversationId();
        var first = app.send(id, "{\"message\":\"original q\",\"toolMode\":\"none\"}");
        var nodes = graph.allInConversation(id);
        ChatMessageNode originalQuestion = nodes.get(0);
        ChatMessageNode originalAnswer = nodes.get(1);

        var edited = app.editMessage(id, "{\"message\":\"edited q\",\"toolMode\":\"none\",\"targetNodeId\":\""
                + originalQuestion.id() + "\"}", null);
        assertEquals("graph answer", edited.answer());

        var after = graph.allInConversation(id);
        assertEquals(4, after.size());
        // original nodes untouched
        assertEquals("original q", after.stream().filter(n -> n.id().equals(originalQuestion.id())).findFirst().orElseThrow().text());
        assertEquals("graph answer", after.stream().filter(n -> n.id().equals(originalAnswer.id())).findFirst().orElseThrow().text());
        // new versioned root question + its answer
        var editedRoot = after.stream().filter(n -> n.text().equals("edited q")).findFirst().orElseThrow();
        assertNull(editedRoot.parentId());
        assertEquals(2, editedRoot.version());
        assertEquals("edited q", app.conversationGraph(id, null).path().get(0).text());
    }

    @Test
    void regenerateMessageAppendsSiblingAssistantWithFreshExecution() {
        var graph = new MemoryGraph();
        var app = appWithModel(graph);
        var id = app.open("{}").conversationId();
        var first = app.send(id, "{\"message\":\"regenerate q\",\"toolMode\":\"none\"}");
        ChatMessageNode question = graph.allInConversation(id).get(0);

        var regenerated = app.regenerateMessage(id, "{\"message\":\"regenerate q\",\"toolMode\":\"none\",\"targetNodeId\":\""
                + question.id() + "\"}", null);
        assertEquals("graph answer", regenerated.answer());

        var after = graph.allInConversation(id);
        assertEquals(3, after.size());
        var assistants = after.stream().filter(n -> n.role() == ChatMessageNode.Role.ASSISTANT).toList();
        assertEquals(2, assistants.size());
        assertEquals(1, assistants.get(0).version());
        assertEquals(2, assistants.get(1).version());
        assertEquals(question.id(), assistants.get(1).parentId());
        assertNotEquals(String.valueOf(first.executionId()), assistants.get(1).executionId());
    }

    @Test
    void graphReadIsNullSafeWithoutPort() {
        var app = app(null);
        var id = app.open("{}").conversationId();
        ChatMessageNodeView.GraphView view = app.conversationGraph(id, null);
        assertNotNull(view);
        assertTrue(view.path().isEmpty());
        assertTrue(view.all().isEmpty());
    }
}
