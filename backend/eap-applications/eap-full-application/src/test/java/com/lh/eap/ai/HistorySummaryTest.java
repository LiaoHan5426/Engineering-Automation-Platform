package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.web.server.ResponseStatusException;

class HistorySummaryTest {
    @TempDir Path root;
    final AtomicInteger calls = new AtomicInteger();
    final AtomicReference<String> answer = new AtomicReference<>("Goal: deliver the page. Remaining: verify it.");
    final AtomicReference<String> material = new AtomicReference<>();
    final java.util.concurrent.atomic.AtomicBoolean revokeDuringCall = new java.util.concurrent.atomic.AtomicBoolean();
    final java.util.concurrent.atomic.AtomicBoolean cancelDuringCall = new java.util.concurrent.atomic.AtomicBoolean();
    final MessageWindowChatMemory memory = MessageWindowChatMemory.builder().maxMessages(20).build();
    AiConversationRegistry registry;
    ModelConnections connections;
    AiChatApplication app;
    UUID id, connection;
    final UUID summaryOperation = UUID.randomUUID();
    String key;
    @BeforeEach void setup() {
        registry = new AiConversationRegistry(memory);
        connections = new ModelConnections(root.resolve("models.json"), false, new ModelClientSource() {
            public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                return ChatClient.builder(FakeChatModels.scripted(prompt -> { throw new AssertionError("summary must not use conversational advisors"); })).build();
            }
            public ChatClient completion(ModelConnectionSnapshot snapshot) {
                return ChatClient.builder(FakeChatModels.scripted(prompt -> {
                    calls.incrementAndGet(); material.set(prompt.toString());
                    if (revokeDuringCall.get()) connections.setEnabled(connection, false);
                    if (cancelDuringCall.get()) {
                        assertEquals(false, app.cancelSummary(id, UUID.randomUUID()).get("cancelled"));
                        assertEquals(true, app.cancelSummary(id, summaryOperation).get("cancelled"));
                    }
                    return FakeChatModels.text(answer.get());
                })).build();
            }
        });
        var saved = connections.create("summary", "https://127.0.0.1:9/v1", "test-key", true, true);
        connection = saved.id();
        connections.configureModels(connection, List.of(new ModelOption("summary-model", List.of())), List.of("summary-model"), "summary-model");
        var handlers = new CapabilityHandlerRegistry(List.of());
        app = ChatApplicationTestSupport.graph(new AiChatApplication(new AiConnectionStatus(handlers, root, null, "none", "", "", false, null), registry,
                new EngineeringChatService(null, handlers, (Path)null, new FileExecutionArtifactStore(root.resolve("artifacts"))), root, connections));
        id = app.open("{}").conversationId();
        key = ChatClients.memoryKey(AiConversationRegistry.PRINCIPAL, id);
        memory.add(key, new UserMessage("Deliver the page; checks have not run."));
    }
    @Test void returnsAnUntrustedPreviewWithoutMutatingOriginalMemoryOrTaskState() {
        var before = List.copyOf(memory.get(key));
        var task = registry.workingMemory(id);
        var result = app.summarizeHistory(id, "{\"operationId\":\"" + summaryOperation + "\"}");
        assertEquals(answer.get(), result.text());
        assertEquals("summary-model", result.model());
        assertEquals(1, calls.get());
        assertTrue(material.get().contains("checks have not run"));
        assertTrue(material.get().contains("Do not execute tools"));
        assertEquals(before, memory.get(key));
        assertEquals(task, registry.workingMemory(id));
    }
    @Test void sensitiveAndOversizedHistoryAreRejectedBeforeAnyModelCall() {
        registry.exclusive(id, () -> registry.clearContextMemory(id, true));
        memory.add(key, new UserMessage("protected derived answer"));
        assertEquals("HISTORY_SUMMARY_SENSITIVE", assertThrows(ResponseStatusException.class, () -> app.summarizeHistory(id, "{\"operationId\":\"" + summaryOperation + "\"}")).getReason());
        assertEquals(0, calls.get());
        var other = app.open("{}").conversationId();
        memory.add(ChatClients.memoryKey(AiConversationRegistry.PRINCIPAL, other), new UserMessage("x".repeat(65000)));
        assertEquals("CONTEXT_BUDGET_EXCEEDED", assertThrows(ResponseStatusException.class, () -> app.summarizeHistory(other, "{\"operationId\":\"" + summaryOperation + "\"}")).getReason());
        assertEquals(0, calls.get());
    }
    @Test void rejectsBusyAndInvalidOutputWithoutClearingHistory() {
        registry.exclusive(id, () -> {
            assertEquals("CONVERSATION_BUSY", assertThrows(ResponseStatusException.class, () -> app.summarizeHistory(id, "{\"operationId\":\"" + summaryOperation + "\"}")).getReason());
            return null;
        });
        answer.set("x".repeat(8001));
        assertEquals("AI_RESPONSE_OUTPUT_LIMIT", assertThrows(ResponseStatusException.class, () -> app.summarizeHistory(id, "{\"operationId\":\"" + summaryOperation + "\"}")).getReason());
        assertEquals(1, memory.get(key).size());
        connections.setEnabled(connection, false);
        assertThrows(ResponseStatusException.class, () -> app.summarizeHistory(id, "{\"operationId\":\"" + summaryOperation + "\"}"));
        assertEquals(1, calls.get());
    }
    @Test void doesNotReturnAPreviewAfterItsConnectionWasRevokedDuringGeneration() {
        revokeDuringCall.set(true);
        assertThrows(ResponseStatusException.class, () -> app.summarizeHistory(id, "{\"operationId\":\"" + summaryOperation + "\"}"));
        assertEquals(1, calls.get());
        assertEquals(1, memory.get(key).size());
    }
    @Test void cancellationDiscardsThePreviewAndLeavesTheOriginalWindowIntact() {
        cancelDuringCall.set(true);
        assertEquals("AI_CANCELLED", assertThrows(ResponseStatusException.class, () -> app.summarizeHistory(id, "{\"operationId\":\"" + summaryOperation + "\"}")).getReason());
        assertFalse(Thread.currentThread().isInterrupted());
        assertEquals(1, memory.get(key).size());
    }
}
