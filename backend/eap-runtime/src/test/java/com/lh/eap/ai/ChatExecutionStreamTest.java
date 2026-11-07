package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.AiChatController;
import com.lh.eap.web.controller.ApiErrorHandler;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ChatExecutionStreamTest {
    @TempDir Path root;

    @Test
    void journalDedupsBySequenceAndRejectsInvalidCursor() {
        var journal = new ChatExecutionJournal();
        var conversation = UUID.randomUUID();
        var execution = UUID.randomUUID();
        var emitter = journal.open(execution, conversation);
        emitter.emit("status", "", "", "RUNNING", null);
        emitter.emit("answer.delta", "hello", "", "RUNNING", null);
        emitter.emit("final", "hello", "", "SUCCEEDED", null);
        emitter.complete("SUCCEEDED");
        var snap = journal.snapshot(conversation, execution, 1);
        assertEquals(2, snap.events().size());
        assertEquals(3, snap.latestSequence());
        assertEquals("answer.delta", snap.events().get(0).type());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> journal.snapshot(conversation, execution, 9));
    }

    @Test
    void sendEmitsOrderedEventsAndSnapshotReplaysTail() throws Exception {
        var events = new ArrayList<ChatExecutionEvent>();
        var app = app();
        var id = app.open("{}").conversationId();
        var response = app.send(id, "{\"message\":\"hello-stream\",\"toolMode\":\"none\"}", events::add);
        assertFalse(response.answer().isBlank());
        assertTrue(events.stream().anyMatch(event -> event.type().equals("status")));
        assertTrue(events.stream().anyMatch(event -> event.type().equals("answer.delta")));
        assertEquals("final", events.get(events.size() - 1).type());
        long first = events.get(0).sequence();
        for (int i = 1; i < events.size(); i++) assertEquals(first + i, events.get(i).sequence());
        var snap = app.executionSnapshot(id, response.executionId(), 0);
        assertEquals(events.size(), snap.events().size());
        assertTrue(snap.complete());
    }

    @Test
    void httpMessagesAreSseAndCancelIsIdleNoop() throws Exception {
        var app = app();
        var id = app.open("{}").conversationId();
        var result = mvc(app).perform(post("/api/ai/conversations/" + id + "/messages")
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.TEXT_EVENT_STREAM_VALUE)
                        .content("{\"message\":\"sse-hi\",\"toolMode\":\"none\"}"))
                .andReturn();
        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertTrue(result.getResponse().getContentType().contains("text/event-stream"));
        assertTrue(result.getResponse().getContentAsString().contains("answer.delta")
                || result.getResponse().getContentAsString().contains("final"));
        mvc(app).perform(post("/api/ai/conversations/" + id + "/cancel")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelled").value(false));
    }

    @Test
    void cancelMarksBusyConversation() throws Exception {
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(4).build());
        var session = registry.open(root, "label");
        var started = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var worker = new Thread(() -> registry.exclusive(session.id, () -> {
            started.countDown();
            try {
                release.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            return null;
        }));
        worker.start();
        assertTrue(started.await(2, java.util.concurrent.TimeUnit.SECONDS));
        assertTrue(registry.cancel(session.id));
        assertTrue(registry.cancelRequested(session.id));
        release.countDown();
        worker.join(2000);
        assertFalse(registry.cancel(session.id));
    }

    AiChatApplication app() {
        var handlers = new CapabilityHandlerRegistry(List.of());
        var status = new AiConnectionStatus(handlers, root, null, "openai", "offline-model", "https://api.openai.com", true);
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var fake = FakeChatModels.scripted(prompt -> FakeChatModels.text("stream-answer"));
        var client = EngineeringAiConfiguration.createClient(ChatClient.builder(fake), memory);
        var chat = new EngineeringChatService(client, handlers, (Path) null, new FileExecutionArtifactStore(root.resolve("artifacts")));
        return new AiChatApplication(status, new AiConversationRegistry(memory), chat, root, null, new ChatExecutionJournal());
    }

    MockMvc mvc(AiChatApplication app) {
        return MockMvcBuilders.standaloneSetup(new AiChatController(app)).setControllerAdvice(new ApiErrorHandler())
                .addFilters(new AiBrowserRequestGuard()).build();
    }
}
