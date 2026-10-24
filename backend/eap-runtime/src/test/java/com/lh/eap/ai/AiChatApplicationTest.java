package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.domain.model.NodeResult;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.AiChatController;
import com.lh.eap.web.controller.ApiErrorHandler;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class AiChatApplicationTest {
    @TempDir Path root;

    CapabilityHandler handler(AtomicInteger calls) {
        return new CapabilityHandler() {
            public Set<String> capabilities() { return Set.of("git-status"); }
            public com.lh.eap.domain.model.NodeResult handle(CapabilityContext context) {
                calls.incrementAndGet();
                return new NodeResult(true, false, "ok", java.util.Map.of("stdout", "?? noted.txt"));
            }
        };
    }

    AiChatApplication app(ChatModel model, boolean modelPresent, Path authorized, AtomicInteger toolCalls) {
        var handlers = new CapabilityHandlerRegistry(List.of(toolCalls == null ? handler(new AtomicInteger()) : handler(toolCalls)));
        var status = new AiConnectionStatus(handlers, root, authorized, modelPresent ? "openai" : "none",
                "offline-model", "https://api.openai.com", modelPresent);
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        ChatModel fake = model == null ? null : FakeChatModels.scripted(model::call);
        var client = fake == null ? null : EngineeringAiConfiguration.createClient(ChatClient.builder(fake), memory);
        var chat = new EngineeringChatService(client, handlers, authorized, new FileExecutionArtifactStore(root.resolve("artifacts")));
        return new AiChatApplication(status, new AiConversationRegistry(memory), chat, root);
    }

    MockMvc mvc(AiChatApplication app) {
        return MockMvcBuilders.standaloneSetup(new AiChatController(app)).setControllerAdvice(new ApiErrorHandler())
                .addFilters(new AiBrowserRequestGuard()).build();
    }

    @Test void statusIsReadWithoutCallingTheModel() throws Exception {
        var calls = new AtomicInteger();
        var app = app(p -> { calls.incrementAndGet(); return FakeChatModels.text("should-not-run"); }, true, null, null);
        mvc(app).perform(get("/api/ai/status")).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("configured_unverified"))
                .andExpect(jsonPath("$.tools.git_status").value(false))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString(root.toString()))));
        assertEquals(0, calls.get());
    }

    @Test void disabledSendDoesNotInventAnAnswer() {
        var calls = new AtomicInteger();
        var app = app(p -> { calls.incrementAndGet(); return FakeChatModels.text("invented"); }, false, null, null);
        var id = app.open("{}").conversationId();
        var error = assertThrows(ResponseStatusException.class, () -> app.send(id, "{\"message\":\"hi\",\"toolMode\":\"none\"}"));
        assertEquals(503, error.getStatusCode().value());
        assertEquals("AI_NOT_CONFIGURED", error.getReason());
        assertEquals(0, calls.get());
        assertEquals("disabled", app.status().state());
    }

    @Test void forgedGrantIdentityAndPathAreRejectedBeforeTheModel() {
        var calls = new AtomicInteger();
        var app = app(p -> { calls.incrementAndGet(); return FakeChatModels.text("no"); }, true, null, null);
        var id = app.open("{}").conversationId();
        for (var body : List.of(
                "{\"message\":\"hi\",\"toolMode\":\"none\",\"gitAllowed\":true}",
                "{\"message\":\"hi\",\"toolMode\":\"none\",\"principal\":\"root\"}",
                "{\"message\":\"hi\",\"toolMode\":\"none\",\"workspace\":\"../outside\"}",
                "{\"message\":\"   \",\"toolMode\":\"none\"}",
                "{\"message\":\"hi\",\"toolMode\":\"shell\"}")) {
            var error = assertThrows(ResponseStatusException.class, () -> app.send(id, body));
            assertEquals(400, error.getStatusCode().value(), body);
        }
        assertEquals(0, calls.get());
        assertThrows(ResponseStatusException.class, () -> app.send(UUID.randomUUID(), "{\"message\":\"hi\",\"toolMode\":\"none\"}"));
    }

    @Test void ordinaryChatDoesNotRegisterGitAndGitRequestIsNotAGrant() {
        var calls = new AtomicInteger();
        var turns = new AtomicInteger();
        var app = app(p -> {
            turns.incrementAndGet();
            return FakeChatModels.text("plain answer");
        }, true, null, calls);
        var id = app.open(null).conversationId();
        var denied = assertThrows(ResponseStatusException.class,
                () -> app.send(id, "{\"message\":\"inspect\",\"toolMode\":\"git_status\"}"));
        assertEquals(403, denied.getStatusCode().value());
        assertEquals(0, turns.get());
        var sent = app.send(id, "{\"message\":\"hello\",\"toolMode\":\"none\"}");
        assertEquals("plain answer", sent.answer());
        assertEquals("NOT_REQUIRED", sent.approval());
        assertEquals("UNVERIFIED", sent.verification());
        assertEquals("SUCCEEDED", sent.status());
        assertEquals(0, calls.get());
        assertEquals("available", app.status().state());
        assertFalse(sent.artifacts().isEmpty());
        assertEquals(64, sent.artifacts().getFirst().sha256().length());
    }

    @Test void conversationsDoNotShareMemory() {
        var seen = new java.util.ArrayList<String>();
        var app = app(p -> {
            seen.add(p.getInstructions().stream().map(message -> String.valueOf(message.getText())).reduce("", (a, b) -> a + "\n" + b));
            return FakeChatModels.text("plain");
        }, true, null, new AtomicInteger());
        var first = app.open("{}");
        app.send(first.conversationId(), "{\"message\":\"private-marker\",\"toolMode\":\"none\"}");
        var second = app.open("{}");
        var outcome = app.send(second.conversationId(), "{\"message\":\"other\",\"toolMode\":\"none\"}");
        assertEquals("plain", outcome.answer());
        assertTrue(seen.get(0).contains("private-marker"));
        assertFalse(seen.get(1).contains("private-marker"));
    }

    @Test void grantedGitStatusUsesTheExistingHandler() {
        var calls = new AtomicInteger();
        var turns = new AtomicInteger();
        var app = app(p -> {
            if (turns.getAndIncrement() == 0) return new org.springframework.ai.chat.model.ChatResponse(List.of(
                    new org.springframework.ai.chat.model.Generation(org.springframework.ai.chat.messages.AssistantMessage.builder()
                            .content("").toolCalls(List.of(new org.springframework.ai.chat.messages.AssistantMessage.ToolCall(
                                    "call-1", "function", "gitStatus", "{}"))).build())));
            assertTrue(p.getInstructions().stream().filter(ToolResponseMessage.class::isInstance)
                    .map(ToolResponseMessage.class::cast).flatMap(message -> message.getResponses().stream())
                    .anyMatch(response -> response.responseData().contains("noted.txt")));
            return FakeChatModels.text("inspected");
        }, true, root, calls);
        var conversation = app.open("{}");
        var outcome = app.send(conversation.conversationId(), "{\"message\":\"inspect\",\"toolMode\":\"git_status\"}");
        assertEquals("", outcome.error(), outcome.toString());
        assertEquals("inspected", outcome.answer());
        assertEquals(1, calls.get());
        assertEquals("TOOL_SUCCEEDED", outcome.toolEvents().getFirst().code());
        assertEquals("available", app.status().state());
    }

    @Test void badOriginAndContentTypeNeverReachTheModel() throws Exception {
        var calls = new AtomicInteger();
        var mvc = mvc(app(p -> { calls.incrementAndGet(); return FakeChatModels.text("no"); }, true, null, null));
        mvc.perform(post("/api/ai/conversations").contentType(MediaType.APPLICATION_JSON).content("{}")
                .header("Origin", "http://evil.example")).andExpect(status().isForbidden())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("ORIGIN_REJECTED")));
        mvc.perform(post("/api/ai/conversations").contentType(MediaType.TEXT_PLAIN).content("{}")
                .header("Origin", "http://localhost:5173")).andExpect(status().isUnsupportedMediaType());
        mvc.perform(post("/api/ai/conversations").contentType(MediaType.APPLICATION_JSON).content("{}")
                .header("Origin", "http://127.0.0.1:5173")).andExpect(status().isOk())
                .andExpect(jsonPath("$.memory").exists());
        assertEquals(0, calls.get());
    }
}
