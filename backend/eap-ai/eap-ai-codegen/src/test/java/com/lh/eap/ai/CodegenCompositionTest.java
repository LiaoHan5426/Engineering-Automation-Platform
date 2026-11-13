package com.lh.eap.ai;

import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.application.service.PrototypeVersion;
import com.lh.eap.delivery.PrototypeVersionQuery;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Runs on the actual codegen classpath, without the product workflow or HTTP host. */
class CodegenCompositionTest {
    @TempDir Path root;
    private final ChatModel model = mock(ChatModel.class);

    @Test void savedPrototypeReachesModelWithoutWorkflowSqlOrMcp() {
        for (String type : List.of("com.lh.eap.application.service.PrototypeVersionService",
                "com.lh.eap.runtime.sql.DeterministicSqlAnalyzer", "com.lh.eap.runtime.mcp.McpSessionRegistry",
                "com.lh.eap.web.controller.AiChatController")) {
            assertThrows(ClassNotFoundException.class, () -> Class.forName(type));
        }
        var selected = UUID.randomUUID();
        var query = mock(PrototypeVersionQuery.class);
        when(query.find(selected)).thenReturn(new PrototypeVersion(selected, java.util.UUID.randomUUID(), "builder-alpha", "Saved design",
                "{\"kind\":\"textarea\",\"props\":{\"label\":\"说明\",\"placeholder\":\"填写说明\",\"initialValue\":\"第一行\\n第二行\",\"required\":true}}", List.of("Accessible button"), "saved-hash", Instant.now()));
        var observed = new AtomicReference<Prompt>();
        when(model.stream(any(Prompt.class))).thenAnswer(call -> {
            observed.set(call.getArgument(0));
            return reactor.core.publisher.Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage("Reviewed saved design")))));
        });
        var app = application(query);
        var result = app.send(app.open("{}").conversationId(), request(selected.toString()));
        assertEquals("Reviewed saved design", result.answer(), result.error());
        assertTrue(result.error().isEmpty());
        var material = tools.jackson.databind.json.JsonMapper.builder().build().readTree(
                observed.get().getUserMessage().getText().split("<saved-prototype>\\n", 2)[1].split("\\n</saved-prototype>", 2)[0]);
        var field = tools.jackson.databind.json.JsonMapper.builder().build().readTree(material.path("body").asString());
        assertEquals("textarea", field.path("kind").asString());
        assertEquals("第一行\n第二行", field.path("props").path("initialValue").asString());
        assertTrue(field.path("props").path("required").asBoolean());
        assertTrue(observed.get().getUserMessage().getText().contains("Accessible button"));
        assertFalse(result.artifacts().isEmpty());
        assertTrue(result.artifactError().isEmpty());
        verify(query).find(selected);
        verify(model).stream(any(Prompt.class));
    }

    @Test void sourceDeliveryGuidanceRequiresMultilineValuesValidationAndReset() {
        var guidance = TaskContext.parse(java.util.Map.of("mode", "code", "expert", "frontend")).systemInstructions();
        assertTrue(guidance.contains("textarea kind is a multiline text field"));
        assertTrue(guidance.contains("preserve line breaks in initial and edited values"));
        assertTrue(guidance.contains("reject blank/whitespace-only values when required"));
        assertTrue(guidance.contains("restore the exact multiline initial value on RESET"));
    }

    @Test void missingPrototypeAdapterRejectsBeforeModelCall() {
        var app = application(null);
        var failure = assertThrows(ResponseStatusException.class,
                () -> app.send(app.open("{}").conversationId(), request(UUID.randomUUID().toString())));
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, failure.getStatusCode());
        verify(model, never()).call(any(Prompt.class));
        verify(model, never()).stream(any(Prompt.class));
    }

    @Test void prototypeLookupFailurePropagatesWithoutModelOrDraftFallback() {
        var query = mock(PrototypeVersionQuery.class);
        var selected = UUID.randomUUID();
        var unavailable = new ResponseStatusException(HttpStatus.NOT_FOUND, "PROTOTYPE_NOT_FOUND");
        when(query.find(selected)).thenThrow(unavailable);
        var app = application(query);
        assertSame(unavailable, assertThrows(ResponseStatusException.class,
                () -> app.send(app.open("{}").conversationId(), request(selected.toString()))));
        verify(model, never()).call(any(Prompt.class));
        verify(model, never()).stream(any(Prompt.class));
    }

    @Test void invalidPrototypeIdRejectsBeforeQueryOrModelCall() {
        var query = mock(PrototypeVersionQuery.class);
        var app = application(query);
        var failure = assertThrows(ResponseStatusException.class,
                () -> app.send(app.open("{}").conversationId(), request("invalid-id")));
        assertEquals(HttpStatus.BAD_REQUEST, failure.getStatusCode());
        verifyNoInteractions(query);
        verify(model, never()).call(any(Prompt.class));
        verify(model, never()).stream(any(Prompt.class));
    }

    private AiChatApplication application(PrototypeVersionQuery prototypes) {
        when(model.getOptions()).thenReturn(ToolCallingChatOptions.builder().build());
        var handlers = new CapabilityHandlerRegistry(List.of());
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var client = EngineeringAiConfiguration.createClient(ChatClient.builder(model), memory);
        var chat = new EngineeringChatService(client, handlers, (Path) null,
                new FileExecutionArtifactStore(root.resolve("artifacts")));
        var status = new AiConnectionStatus(handlers, root, null, "openai", "offline", "https://api.openai.com", true);
        var app = new AiChatApplication(status, new AiConversationRegistry(memory), chat, root);
        ReflectionTestUtils.setField(app, "prototypes", prototypes);
        return app;
    }

    private static String request(String version) {
        return """
                {"message":"Review the saved design","toolMode":"none","context":{"prototypeVersionId":"%s"}}
                """.formatted(version);
    }
}
