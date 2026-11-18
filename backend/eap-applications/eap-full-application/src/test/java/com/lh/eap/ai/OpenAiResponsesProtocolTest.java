package com.lh.eap.ai;
import com.lh.eap.delivery.CodeChangeService;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.openai.OpenAiChatOptions;
import tools.jackson.databind.json.JsonMapper;

class OpenAiResponsesProtocolTest {
    @org.junit.jupiter.api.io.TempDir java.nio.file.Path root;
    static final String DELTA = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"proposed code\",\"item_id\":\"msg_1\",\"output_index\":0,\"content_index\":0,\"sequence_number\":1}\n\n";
    static final String COMPLETED = "data: {\"type\":\"response.completed\",\"sequence_number\":2,\"response\":{\"id\":\"resp_1\",\"object\":\"response\",\"created_at\":1,\"status\":\"completed\",\"model\":\"test-model\",\"output\":[]}}\n\n";

    @Test void ordinaryApiKeyResponsesUsesActualResponsesEndpointAndMapsHistoryAndReasoning() throws Exception {
        var path = new AtomicReference<String>();
        var authorization = new AtomicReference<String>();
        var body = new AtomicReference<String>();
        var calls = new AtomicInteger();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            calls.incrementAndGet();
            path.set(exchange.getRequestURI().getPath());
            authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
            body.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            var bytes = (DELTA + COMPLETED).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        try {
            var snapshot = snapshot(server, "responses");
            var source = new SpringAiModelClientSource(MessageWindowChatMemory.builder().build());
            var answer = source.completion(snapshot).prompt().messages(List.of(new SystemMessage("Keep conventions"),
                    new UserMessage("First"), new AssistantMessage("Answer"), new UserMessage("Next")))
                    .options(OpenAiChatOptions.builder().reasoningEffort("high")).call().content();
            assertEquals("/v1/responses", path.get());
            assertEquals("Bearer test-key", authorization.get());
            assertEquals("proposed code", answer);
            var json = JsonMapper.builder().build().readTree(body.get());
            assertEquals("test-model", json.get("model").asText());
            assertFalse(json.get("store").asBoolean());
            assertTrue(json.get("stream").asBoolean());
            assertEquals("Keep conventions\n", json.get("instructions").asText());
            assertEquals("high", json.get("reasoning").get("effort").asText());
            assertEquals(3, json.get("input").size());
            assertEquals("assistant", json.get("input").get(1).get("role").asText());
            assertEquals("Answer", json.get("input").get(1).get("content").asText());
            assertFalse(json.has("previous_response_id"));
            assertFalse(json.has("tools"));
            assertEquals(1, calls.get());
        } finally { server.stop(0); }
    }

    static ModelConnectionSnapshot snapshot(HttpServer server, String wireApi) {
        return new ModelConnectionSnapshot(UUID.randomUUID(), "local", ModelConnections.KIND, true,
                "http://127.0.0.1:" + server.getAddress().getPort() + "/v1", "test-model", "test-key", 1, true, "test", wireApi);
    }

    @Test void failedIncompleteAndTruncatedStreamsNeverSucceedOrFallback() throws Exception {
        for (String ending : List.of("", "data: {\"type\":\"response.failed\",\"response\":{},\"sequence_number\":2}\n\n",
                "data: {\"type\":\"response.incomplete\",\"response\":{},\"sequence_number\":2}\n\n",
                "data: {\"type\":\"error\",\"code\":\"server_error\",\"message\":\"failed\",\"param\":null,\"sequence_number\":2}\n\n")) {
            var paths = new java.util.ArrayList<String>();
            var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/", exchange -> {
                paths.add(exchange.getRequestURI().getPath());
                exchange.getRequestBody().readAllBytes();
                var bytes = (DELTA + ending).getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, bytes.length);
                try (var out = exchange.getResponseBody()) { out.write(bytes); }
            });
            server.start();
            try {
                var client = new SpringAiModelClientSource(MessageWindowChatMemory.builder().build()).completion(snapshot(server, "responses"));
                var error = assertThrows(IllegalStateException.class, () -> client.prompt().user("request").call().content());
                assertEquals(ending.isEmpty() ? "AI_RESPONSE_INCOMPLETE" : "AI_RESPONSE_FAILED", error.getMessage());
                assertEquals(List.of("/v1/responses"), paths);
            } finally { server.stop(0); }
        }
    }

    @Test void providerErrorsNeverRetryWithChatCompletions() throws Exception {
        var paths = new java.util.ArrayList<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            paths.add(exchange.getRequestURI().getPath());
            exchange.getRequestBody().readAllBytes();
            var bytes = "{\"error\":{\"message\":\"unsupported\",\"type\":\"invalid_request_error\"}}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(400, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        try {
            var client = new SpringAiModelClientSource(MessageWindowChatMemory.builder().build()).completion(snapshot(server, "responses"));
            assertThrows(RuntimeException.class, () -> client.prompt().user("request").call().content());
            assertEquals(List.of("/v1/responses"), paths);
        } finally { server.stop(0); }
    }

    @Test void legacyOrdinaryConnectionsStillUseChatCompletions() throws Exception {
        var path = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            path.set(exchange.getRequestURI().getPath());
            exchange.getRequestBody().readAllBytes();
            var bytes = "{\"id\":\"chatcmpl-1\",\"object\":\"chat.completion\",\"created\":1,\"model\":\"test-model\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"legacy answer\"},\"finish_reason\":\"stop\"}]}".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        try {
            var original = snapshot(server, "chat-completions");
            var legacy = new ModelConnectionSnapshot(original.id, original.name, original.kind, true, original.baseUrl,
                    original.model, original.secret, 1, true, "legacy");
            assertEquals("chat-completions", legacy.wireApi);
            var client = new SpringAiModelClientSource(MessageWindowChatMemory.builder().build()).completion(legacy);
            assertEquals("legacy answer", client.prompt().user("request").call().content());
            assertEquals("/v1/chat/completions", path.get());
        } finally { server.stop(0); }
    }

    @Test void duplicateToolNamesAreRejectedBeforeTransportRatherThanSilentlyOverwritten() {
        var callback = callback("lookup", new AtomicInteger(), false);
        var prompt = new org.springframework.ai.chat.prompt.Prompt("request",
                OpenAiChatOptions.builder().toolCallbacks(callback, callback).build());
        assertEquals("AI_TOOL_NAME_DUPLICATE", assertThrows(IllegalArgumentException.class,
                () -> OpenAiResponsesChatModel.parameters(prompt, "m")).getMessage());
    }

    @Test void assistantToolHistoryCannotBeSilentlyFlattenedIntoText() {
        var assistant = AssistantMessage.builder().content("").toolCalls(List.of(
                new AssistantMessage.ToolCall("call-1", "function", "gitStatus", "{}"))).build();
        var prompt = new org.springframework.ai.chat.prompt.Prompt(List.of(new UserMessage("request"), assistant));
        assertEquals("AI_TOOL_HISTORY_INCOMPLETE", assertThrows(IllegalArgumentException.class,
                () -> OpenAiResponsesChatModel.parameters(prompt, "m")).getMessage());
    }

    private static org.springframework.ai.tool.ToolCallback callback(String name, AtomicInteger calls, boolean direct) {
        return new org.springframework.ai.tool.ToolCallback() {
            public org.springframework.ai.tool.definition.ToolDefinition getToolDefinition() {
                return org.springframework.ai.tool.definition.ToolDefinition.builder().name(name).description("Local test tool")
                        .inputSchema("{\"type\":\"object\",\"properties\":{\"value\":{\"type\":\"string\"}},\"required\":[\"value\"]}").build();
            }
            public org.springframework.ai.tool.metadata.ToolMetadata getToolMetadata() {
                return org.springframework.ai.tool.metadata.ToolMetadata.builder().returnDirect(direct).build();
            }
            public String call(String input) { calls.incrementAndGet(); return "local-result:" + input; }
        };
    }
    private static java.util.Map<String,Object> function(String name, String id, String arguments) {
        return java.util.Map.of("type", "function_call", "id", "fc_" + id, "call_id", id, "name", name, "arguments", arguments, "status", "completed");
    }
    private static String toolStream(List<java.util.Map<String,Object>> items, boolean completed) {
        var json = JsonMapper.builder().build(); var stream = new StringBuilder();
        for (int i = 0; i < items.size(); i++) stream.append("data: ").append(json.writeValueAsString(java.util.Map.of(
                "type", "response.output_item.done", "sequence_number", i + 1, "output_index", i, "item", items.get(i)))).append("\n\n");
        if (completed) stream.append("data: ").append(json.writeValueAsString(java.util.Map.of("type", "response.completed", "sequence_number", items.size() + 1,
                "response", java.util.Map.of("id", "resp_tools", "object", "response", "created_at", 1, "status", "completed", "model", "test-model", "output", items)))).append("\n\n");
        return stream.toString();
    }
    private static HttpServer server(java.util.function.Function<String,String> handler) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/responses", exchange -> {
            String request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            var bytes = handler.apply(request).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start(); return server;
    }

    @Test void springAiOwnsTwoRoundToolLoopAndReplaysEncryptedReasoningAndCallOutputs() throws Exception {
        var requests = new java.util.concurrent.CopyOnWriteArrayList<tools.jackson.databind.JsonNode>();
        var calls = new AtomicInteger(); var json = JsonMapper.builder().build();
        var server = server(body -> {
            requests.add(json.readTree(body));
            if (requests.size() == 1) return toolStream(List.of(
                    java.util.Map.of("type", "reasoning", "id", "rs_1", "summary", List.of(), "encrypted_content", "opaque-test-reasoning"),
                    function("lookup", "call_1", "{\"value\":\"first\"}")), true);
            return toolStream(List.of(function("finish", "call_2", "{\"value\":\"finished\"}")), true);
        });
        try {
            var client = new SpringAiModelClientSource(MessageWindowChatMemory.builder().build()).completion(snapshot(server, "responses"));
            String answer = client.prompt().user("run local tools")
                    .options(OpenAiChatOptions.builder().maxTokens(512))
                    .tools(callback("lookup", calls, false), callback("finish", calls, true))
                    .advisors(org.springframework.ai.chat.client.advisor.ToolCallingAdvisor.builder().build()).call().content();
            assertTrue(answer.contains("finished")); assertEquals(2, calls.get()); assertEquals(2, requests.size());
            var first = requests.getFirst();
            assertFalse(first.get("store").asBoolean()); assertFalse(first.get("parallel_tool_calls").asBoolean());
            assertEquals(512, first.get("max_output_tokens").asInt());
            assertTrue(first.get("include").toString().contains("reasoning.encrypted_content"));
            assertEquals("function", first.get("tools").get(0).get("type").asText());
            assertFalse(first.get("tools").get(0).get("strict").asBoolean());
            assertTrue(first.get("tools").get(0).get("parameters").get("properties").has("value"));
            var history = requests.get(1).get("input");
            assertEquals("reasoning", history.get(1).get("type").asText());
            assertEquals("opaque-test-reasoning", history.get(1).get("encrypted_content").asText());
            assertEquals("call_1", history.get(2).get("call_id").asText());
            assertEquals("fc_call_1", history.get(2).get("id").asText());
            assertEquals("function_call_output", history.get(3).get("type").asText());
            assertEquals("call_1", history.get(3).get("call_id").asText());
            assertTrue(history.get(3).get("output").asText().contains("local-result"));
            assertFalse(requests.get(1).has("previous_response_id"));
        } finally { server.stop(0); }
    }

    @Test void incompleteAndUntrustedToolResponsesNeverInvokeAnyCallback() throws Exception {
        var calls = new AtomicInteger();
        var valid = function("lookup", "call_1", "{\"value\":\"x\"}");
        var responses = List.of(toolStream(List.of(valid), false),
                toolStream(List.of(function("unregistered", "call_1", "{}")), true),
                toolStream(List.of(valid, valid), true),
                toolStream(List.of(function("lookup", "call_1", "not-json")), true),
                toolStream(List.of(function("lookup", "call_1", "{\"value\":\"" + "x".repeat(65000) + "\"}")), true),
                toolStream(List.of(valid), false) + "data: {\"type\":\"error\",\"code\":\"failed\",\"message\":\"fixture\",\"param\":null,\"sequence_number\":2}\n\n");
        for (var response : responses) {
            var server = server(body -> response);
            try {
                var client = new SpringAiModelClientSource(MessageWindowChatMemory.builder().build()).completion(snapshot(server, "responses"));
                assertThrows(RuntimeException.class, () -> client.prompt().user("run")
                        .tools(callback("lookup", calls, true))
                        .advisors(org.springframework.ai.chat.client.advisor.ToolCallingAdvisor.builder().build()).call().content());
                assertEquals(0, calls.get());
            } finally { server.stop(0); }
        }
    }

    @Test void streamingToolCallsAreExposedOnlyAfterCompletedResponse() throws Exception {
        var calls = new AtomicInteger();
        for (boolean completed : List.of(false, true)) {
            var server = server(body -> toolStream(List.of(function("lookup", "call_1", "{\"value\":\"x\"}")), completed));
            try {
                var model = new OpenAiResponsesChatModel(snapshot(server, "responses"));
                var prompt = new org.springframework.ai.chat.prompt.Prompt("run", OpenAiChatOptions.builder().toolCallbacks(callback("lookup", calls, false)).build());
                var emitted = new java.util.ArrayList<org.springframework.ai.chat.model.ChatResponse>();
                if (completed) {
                    model.stream(prompt).doOnNext(emitted::add).blockLast();
                    assertEquals("call_1", emitted.getLast().getResult().getOutput().getToolCalls().getFirst().id());
                } else {
                    assertThrows(RuntimeException.class, () -> model.stream(prompt).doOnNext(emitted::add).blockLast());
                    assertTrue(emitted.isEmpty());
                }
                assertEquals(0, calls.get());
            } finally { server.stop(0); }
        }
    }

    @Test void wrongCallIdOrNameInToolResultsIsRejectedWithoutTransport() {
        var assistant = AssistantMessage.builder().content("").toolCalls(List.of(new AssistantMessage.ToolCall("call-1", "function", "lookup", "{}"))).build();
        for (var result : List.of(new org.springframework.ai.chat.messages.ToolResponseMessage.ToolResponse("wrong-id", "lookup", "output"),
                new org.springframework.ai.chat.messages.ToolResponseMessage.ToolResponse("call-1", "wrong-name", "output"))) {
            var prompt = new org.springframework.ai.chat.prompt.Prompt(List.of(assistant,
                    org.springframework.ai.chat.messages.ToolResponseMessage.builder().responses(List.of(result)).build()));
            assertEquals("AI_TOOL_HISTORY_INVALID", assertThrows(IllegalArgumentException.class,
                    () -> OpenAiResponsesChatModel.parameters(prompt, "m")).getMessage());
        }
    }

    @Test void responsesSupportsBoundConversationMemoryAndReviewOnlyCodeProposals() throws Exception {
        var requests = new java.util.concurrent.CopyOnWriteArrayList<tools.jackson.databind.JsonNode>();
        var json = JsonMapper.builder().build();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/responses", exchange -> {
            requests.add(json.readTree(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
            String answer = requests.size() < 3 ? "offline answer" : "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}";
            var delta = json.writeValueAsString(java.util.Map.of("type", "response.output_text.delta", "delta", answer,
                    "item_id", "msg_1", "output_index", 0, "content_index", 0, "sequence_number", 1));
            var bytes = ("data: " + delta + "\n\n" + COMPLETED).getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, bytes.length);
            try (var out = exchange.getResponseBody()) { out.write(bytes); }
        });
        server.start();
        try {
            java.nio.file.Files.writeString(root.resolve("Page.vue"), "original");
            var memory = MessageWindowChatMemory.builder().build();
            var connections = new ModelConnections(root.resolve("connections.json"), true, new SpringAiModelClientSource(memory));
            var saved = connections.create("local", snapshot(server, "responses").baseUrl, "test-key", true, true, "responses");
            connections.configureModels(saved.id(), List.of(new ModelOption("test-model", List.of("high"))), List.of("test-model"), "test-model");
            var handlers = new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of());
            var status = new AiConnectionStatus(handlers, root, root, "none", "", "", false, connections);
            var app = ChatApplicationTestSupport.graph(new AiChatApplication(status, new AiConversationRegistry(memory),
                    new EngineeringChatService(null, handlers, root,
                            new com.lh.eap.application.service.FileExecutionArtifactStore(root.resolve("artifacts"))), root, connections));
            org.springframework.test.util.ReflectionTestUtils.setField(app, "codeChanges", new CodeChangeService(
                    new com.lh.eap.config.RuntimeWorkspace(root, root.toString()), null, null,
                    new InMemoryCodeGenerationStore(), new InMemoryCodeProposalStore()));
            var id = app.open("{}").conversationId();
            assertEquals("offline answer", app.send(id, ChatApplicationTestSupport.request(app, id,  "{\"message\":\"memory-marker\",\"toolMode\":\"none\"}")).answer());
            assertEquals("offline answer", app.send(id, ChatApplicationTestSupport.request(app, id,  "{\"message\":\"followup\",\"toolMode\":\"none\",\"context\":{\"reasoning\":\"high\"}}")).answer());
            assertTrue(requests.get(1).get("input").toString().contains("memory-marker"));
            assertEquals("high", requests.get(1).get("reasoning").get("effort").asText());
            var code = app.send(id, ChatApplicationTestSupport.request(app, id,  "{\"message\":\"edit\",\"toolMode\":\"none\",\"context\":{\"mode\":\"code\",\"targetPath\":\"Page.vue\"}}"));
            assertEquals("", code.error());
            assertNotNull(code.proposal());
            assertEquals("original", java.nio.file.Files.readString(root.resolve("Page.vue")));
            assertTrue(requests.get(2).get("input").toString().contains("original"));
            assertEquals(3, requests.size());
        } finally { server.stop(0); }
    }
}
