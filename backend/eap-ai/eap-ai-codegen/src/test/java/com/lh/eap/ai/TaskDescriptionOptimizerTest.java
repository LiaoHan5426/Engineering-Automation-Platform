package com.lh.eap.ai;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Flux;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TaskDescriptionOptimizerTest {
    private final ModelConnections connections = mock(ModelConnections.class);
    private final ChatModel model = mock(ChatModel.class);
    private final UUID connectionId = UUID.randomUUID();
    private final ModelConnectionSnapshot snapshot = new ModelConnectionSnapshot(connectionId, "test", "openai-compatible",
            true, "https://api.openai.com/v1", "test-model", "secret-do-not-expose", 1, true, "1");
    private final TaskDescriptionOptimizer optimizer = new TaskDescriptionOptimizer(connections);

    private void configure(Flux<ChatResponse> output) {
        when(connections.effectiveDefault()).thenReturn(snapshot);
        when(connections.require(connectionId)).thenReturn(snapshot);
        when(connections.requireModel(connectionId, "test-model")).thenReturn(snapshot);
        when(model.getOptions()).thenReturn(ToolCallingChatOptions.builder().build());
        when(model.stream(any(Prompt.class))).thenReturn(output);
        when(connections.completionClient(snapshot)).thenReturn(ChatClient.builder(model).build());
    }
    private static ChatResponse response(String text) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(text))));
    }
    private TaskDescriptionOptimizer.Request request(String text) {
        return new TaskDescriptionOptimizer.Request(text, null, null);
    }
    private TaskDescriptionOptimizer.Suggestion run(String text) {
        return optimizer.optimize("alice", UUID.randomUUID(), request(text)).block(Duration.ofSeconds(5));
    }

    @Test void preservesExactInputAndOutputNewlinesWithNoToolsOrConversation() {
        configure(Flux.just(response("目标\n"), response("\n- 验收条件")));
        var source = "原任务\n保留 {identifier} 与路径 C:\\work\n";
        var result = run(source);
        assertEquals("目标\n\n- 验收条件", result.text());
        assertEquals(connectionId, result.connectionId());
        assertEquals("test-model", result.model());
        var captor = org.mockito.ArgumentCaptor.forClass(Prompt.class);
        verify(model).stream(captor.capture());
        var prompt = captor.getValue();
        assertEquals(source, prompt.getUserMessage().getText());
        assertEquals(2048, prompt.getOptions().getMaxTokens());
        if (prompt.getOptions() instanceof ToolCallingChatOptions options) {
            assertTrue(options.getToolCallbacks() == null || options.getToolCallbacks().isEmpty());
        }
        verify(connections, never()).chatClient(any());
        assertFalse(result.toString().contains(snapshot.secret));
    }

    @Test void rejectsBlankAndOversizeBeforeAccessingConnections() {
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class, () -> run(" \n ")).getStatusCode());
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, assertThrows(ResponseStatusException.class, () -> run("x".repeat(12001))).getStatusCode());
        verifyNoInteractions(connections);
    }

    @Test void rejectsOversizeInsteadOfTruncatingAndReleasesSlot() {
        configure(Flux.just(response("x".repeat(2001))));
        assertEquals("AI_RESPONSE_OUTPUT_LIMIT", assertThrows(ResponseStatusException.class, () -> run("task")).getReason());
        when(model.stream(any(Prompt.class))).thenReturn(Flux.just(response("ok")));
        assertEquals("ok", run("task").text());
    }

    @Test void providerTokenTruncationNeverReturnsPartialSuggestion() {
        var metadata = org.springframework.ai.chat.metadata.ChatGenerationMetadata.builder().finishReason("length").build();
        configure(Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage("partial"), metadata)))));
        assertEquals("AI_RESPONSE_OUTPUT_LIMIT", assertThrows(ResponseStatusException.class, () -> run("task")).getReason());
    }

    @Test void emptyResponseAndProviderFailureHaveStableRedactedCodes() {
        configure(Flux.empty());
        assertEquals("AI_EMPTY_RESPONSE", assertThrows(ResponseStatusException.class, () -> run("task")).getReason());
        when(model.stream(any(Prompt.class))).thenReturn(Flux.error(new IllegalStateException("provider internal diagnostic")));
        var error = assertThrows(ResponseStatusException.class, () -> run("task"));
        assertEquals("AI_PROVIDER_ERROR", error.getReason());
        assertNull(error.getCause());
    }

    @Test void explicitSelectionUsesAllowlistAndDisabledConnectionIsRejected() {
        configure(Flux.just(response("ok")));
        var request = new TaskDescriptionOptimizer.Request("task", connectionId, "test-model");
        assertEquals("ok", optimizer.optimize("alice", UUID.randomUUID(), request).block(Duration.ofSeconds(5)).text());
        verify(connections).require(connectionId);
        verify(connections).requireModel(connectionId, "test-model");
        when(connections.require(connectionId)).thenReturn(new ModelConnectionSnapshot(connectionId, "test", "openai-compatible",
                false, snapshot.baseUrl, snapshot.model, snapshot.secret, 1, false, "1"));
        assertEquals("CONNECTION_DISABLED", assertThrows(ResponseStatusException.class,
                () -> optimizer.optimize("alice", UUID.randomUUID(), request).block(Duration.ofSeconds(5))).getReason());
    }

    @Test void cancellationIsPrincipalScopedAndClosesProviderSubscription() throws Exception {
        var subscribed = new CountDownLatch(1);
        var finished = new CountDownLatch(1);
        var cancelled = new AtomicBoolean();
        configure(Flux.<ChatResponse>never().doOnSubscribe(s -> subscribed.countDown()).doOnCancel(() -> cancelled.set(true)));
        var id = UUID.randomUUID();
        var error = new AtomicReference<Throwable>();
        optimizer.optimize("alice", id, request("task")).subscribe(value -> fail("unexpected result"), failure -> {
            error.set(failure); finished.countDown();
        });
        assertTrue(subscribed.await(3, TimeUnit.SECONDS));
        optimizer.cancel("bob", id);
        assertFalse(cancelled.get());
        optimizer.cancel("alice", id);
        assertTrue(finished.await(3, TimeUnit.SECONDS));
        assertTrue(cancelled.get());
        assertEquals("AI_CANCELLED", ((ResponseStatusException) error.get()).getReason());
        optimizer.cancel("alice", id);
    }

    @Test void concurrencyIsBoundedPerPrincipalAndDisposeReleasesCapacity() throws Exception {
        var subscribed = new CountDownLatch(2);
        configure(Flux.<ChatResponse>never().doOnSubscribe(s -> subscribed.countDown()));
        var first = optimizer.optimize("alice", UUID.randomUUID(), request("task")).subscribe();
        var second = optimizer.optimize("alice", UUID.randomUUID(), request("task")).subscribe();
        try {
            assertTrue(subscribed.await(3, TimeUnit.SECONDS));
            assertEquals("AI_MODEL_UNAVAILABLE", assertThrows(ResponseStatusException.class,
                    () -> optimizer.optimize("alice", UUID.randomUUID(), request("task")).block(Duration.ofSeconds(5))).getReason());
        } finally { first.dispose(); second.dispose(); }
        when(model.stream(any(Prompt.class))).thenReturn(Flux.just(response("ok")));
        assertEquals("ok", run("task").text());
    }

    @Test void unSubscribedRequestDoesNotReserveAndTimeoutClosesProvider() {
        var cancelled = new AtomicBoolean();
        configure(Flux.<ChatResponse>never().doOnCancel(() -> cancelled.set(true)));
        var timed = new TaskDescriptionOptimizer(connections, Duration.ofMillis(100));
        var id = UUID.randomUUID();
        timed.optimize("alice", id, request("not subscribed"));
        var error = assertThrows(ResponseStatusException.class,
                () -> timed.optimize("alice", id, request("task")).block(Duration.ofSeconds(5)));
        assertEquals("AI_TIMED_OUT", error.getReason());
        assertTrue(cancelled.get());
        when(model.stream(any(Prompt.class))).thenReturn(Flux.just(response("ok")));
        assertEquals("ok", timed.optimize("alice", id, request("task")).block(Duration.ofSeconds(5)).text());
    }

    @Test void missingDefaultDoesNotUseFallbackClient() {
        assertEquals("AI_NOT_CONFIGURED", assertThrows(ResponseStatusException.class, () -> run("task")).getReason());
        verify(connections, never()).completionClient(any());
    }
    private TaskDescriptionOptimizer.DetailResult detail(String goal, String acceptance) {
        return optimizer.optimizeTaskDetail("alice", UUID.randomUUID(),
                new TaskDescriptionOptimizer.DetailRequest(goal, acceptance, null, null)).block(Duration.ofSeconds(5));
    }

    @Test void detailOptimizesBothFieldsInOneCompletionWithDistinctJsonContract() {
        configure(Flux.just(response("{\"goal\":\"明确目标\",\"acceptanceCriteria\":\"核验结果\"}")));
        var result = detail("原目标", "原验收");
        assertEquals("明确目标", result.goal());
        assertEquals("核验结果", result.acceptanceCriteria());
        assertEquals(connectionId, result.connectionId());
        var captor = org.mockito.ArgumentCaptor.forClass(Prompt.class);
        verify(model).stream(captor.capture());
        var prompt = captor.getValue();
        assertTrue(prompt.getSystemMessage().getText().contains("cross-referencing both"));
        assertTrue(prompt.getSystemMessage().getText().contains("Do not invent facts"));
        var json = tools.jackson.databind.json.JsonMapper.builder().build().readTree(prompt.getUserMessage().getText());
        assertEquals("原目标", json.path("goal").asString());
        assertEquals("原验收", json.path("acceptanceCriteria").asString());
        assertEquals(32768, prompt.getOptions().getMaxTokens());
        verify(connections, never()).chatClient(any());
    }

    @Test void detailRejectsInvalidInputsBeforeConnectionSelection() {
        for (String value : new String[]{null, "", " \t\n"}) {
            assertEquals("INVALID_REQUEST", assertThrows(ResponseStatusException.class, () -> detail(value, "ok")).getReason());
            assertEquals("INVALID_REQUEST", assertThrows(ResponseStatusException.class, () -> detail("ok", value)).getReason());
        }
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, assertThrows(ResponseStatusException.class,
                () -> detail("x".repeat(2001), "ok")).getStatusCode());
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, assertThrows(ResponseStatusException.class,
                () -> detail("ok", "x".repeat(2001))).getStatusCode());
        verifyNoInteractions(connections);
    }

    @Test void detailStrictlyRejectsMalformedJsonWithoutTruncationOrRepair() {
        for (String invalid : List.of("{}", "[]", "null", "{\"goal\":1,\"acceptanceCriteria\":\"ok\"}",
                "{\"goal\":\"ok\",\"acceptanceCriteria\":null}",
                "{\"goal\":\"ok\",\"acceptanceCriteria\":\" \"}",
                "{\"goal\":\"ok\",\"acceptanceCriteria\":\"ok\",\"extra\":1}",
                "{\"goal\":\"ok\",\"acceptanceCriteria\":\"ok\"} {}",
                "{\"goal\":\"a\",\"goal\":\"b\",\"acceptanceCriteria\":\"ok\"}",
                "```json\n{\"goal\":\"ok\",\"acceptanceCriteria\":\"ok\"}\n```",
                "{\"goal\":\"ok\"")) {
            configure(Flux.just(response(invalid)));
            assertEquals("AI_RESPONSE_ITEMS_INVALID", assertThrows(ResponseStatusException.class, () -> detail("g", "a")).getReason(), invalid);
        }
    }

    @Test void detailAllowsBothMaximumFieldsIncludingWorstCaseJsonEscapingButBoundsBuffer() {
        String escaped = "\\u4e2d".repeat(2000);
        configure(Flux.just(response("{\"goal\":\"" + escaped + "\",\"acceptanceCriteria\":\"" + escaped + "\"}")));
        var result = detail("中".repeat(2000), "中".repeat(2000));
        assertEquals("中".repeat(2000), result.goal());
        assertEquals("中".repeat(2000), result.acceptanceCriteria());
        for (String field : List.of("goal", "acceptanceCriteria")) {
            String output = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(
                    java.util.Map.of("goal", field.equals("goal") ? "x".repeat(2001) : "ok",
                            "acceptanceCriteria", field.equals("acceptanceCriteria") ? "x".repeat(2001) : "ok"));
            configure(Flux.just(response(output)));
            assertEquals("AI_RESPONSE_OUTPUT_LIMIT", assertThrows(ResponseStatusException.class, () -> detail("g", "a")).getReason());
        }
        configure(Flux.just(response(" ".repeat(24129))));
        assertEquals("AI_RESPONSE_OUTPUT_LIMIT", assertThrows(ResponseStatusException.class, () -> detail("g", "a")).getReason());
    }

    @Test void detailChecksOriginalFinishReasonsAndToolCallsBeforeParsing() {
        for (String reason : List.of("length", "content_filter", "tool_calls")) {
            var metadata = org.springframework.ai.chat.metadata.ChatGenerationMetadata.builder().finishReason(reason).build();
            configure(Flux.just(new ChatResponse(List.of(new Generation(new AssistantMessage(
                    "{\"goal\":\"ok\",\"acceptanceCriteria\":\"ok\"}"), metadata)))));
            assertEquals(reason.equals("length") ? "AI_RESPONSE_OUTPUT_LIMIT" : "AI_RESPONSE_INCOMPLETE",
                    assertThrows(ResponseStatusException.class, () -> detail("g", "a")).getReason());
        }
        var output = AssistantMessage.builder().content("{\"goal\":\"ok\",\"acceptanceCriteria\":\"ok\"}")
                .toolCalls(List.of(new AssistantMessage.ToolCall("id", "function", "tool", "{}"))).build();
        configure(Flux.just(new ChatResponse(List.of(new Generation(output)))));
        assertEquals("AI_RESPONSE_TOOL_UNSUPPORTED", assertThrows(ResponseStatusException.class, () -> detail("g", "a")).getReason());
    }

    @Test void detailSharesPrincipalScopedCancellationAndCapacityWithText() throws Exception {
        var subscribed = new CountDownLatch(1);
        var finished = new CountDownLatch(1);
        var error = new AtomicReference<Throwable>();
        configure(Flux.<ChatResponse>never().doOnSubscribe(s -> subscribed.countDown()));
        var id = UUID.randomUUID();
        optimizer.optimizeTaskDetail("alice", id, new TaskDescriptionOptimizer.DetailRequest("g", "a", null, null))
                .subscribe(v -> fail("unexpected"), e -> { error.set(e); finished.countDown(); });
        assertTrue(subscribed.await(3, TimeUnit.SECONDS));
        assertEquals("INVALID_REQUEST", assertThrows(ResponseStatusException.class,
                () -> optimizer.optimize("alice", id, request("task")).block()).getReason());
        optimizer.cancel("bob", id);
        assertEquals(1, finished.getCount());
        optimizer.cancel("alice", id);
        assertTrue(finished.await(3, TimeUnit.SECONDS));
        assertEquals("AI_CANCELLED", ((ResponseStatusException) error.get()).getReason());
    }
}
