package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

class ModelDiscoveryTest {
    @TempDir Path root;

    private ModelConnections connections() {
        return new ModelConnections(root.resolve("connections.json"), false, new ModelClientSource() {
            public org.springframework.ai.chat.client.ChatClient conversational(ModelConnectionSnapshot snapshot) {
                return org.springframework.ai.chat.client.ChatClient.builder(FakeChatModels.scripted(prompt -> FakeChatModels.text(snapshot.model))).build();
            }
            public org.springframework.ai.chat.client.ChatClient completion(ModelConnectionSnapshot snapshot) { return conversational(snapshot); }
        });
    }

    @Test void discoversWithServerCredentialsButDoesNotEnableModelsOrGuessEffortAndKeepsCacheOnFailure() throws Exception {
        var status = new AtomicInteger(200);
        var calls = new AtomicInteger();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/models", exchange -> {
            assertEquals("GET", exchange.getRequestMethod());
            assertEquals("Bearer local-secret", exchange.getRequestHeaders().getFirst("Authorization"));
            calls.incrementAndGet();
            var body = (status.get() == 200 ? "{\"data\":[{\"id\":\"model-a\"},{\"id\":\"model-b\"},{\"id\":\"model-a\"}]}" : "local-secret").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(), body.length);
            try (var output = exchange.getResponseBody()) { output.write(body); }
        });
        server.start();
        try {
            var connections = connections();
            var saved = connections.create("local", "http://127.0.0.1:" + server.getAddress().getPort(), "local-secret", true, true);
            assertTrue(saved.models().isEmpty()); assertEquals("", saved.defaultModel());
            assertNull(connections.effectiveDefault());
            var discovered = connections.refreshModels(saved.id(), new ModelDiscovery());
            assertEquals(List.of("model-a", "model-b"), discovered.models().stream().map(ModelOption::id).toList());
            assertTrue(discovered.allowedModels().isEmpty());
            assertTrue(discovered.models().stream().allMatch(model -> model.reasoningEfforts().isEmpty()));
            connections.configureModels(saved.id(), List.of(new ModelOption("model-a", List.of("low", "high")), new ModelOption("model-b", List.of())), List.of("model-a", "model-b"), "model-a");
            var a = connections.requireModel(saved.id(), "model-a"); var b = connections.requireModel(saved.id(), "model-b");
            assertNotSame(connections.chatClient(a), connections.chatClient(b));
            assertTrue(connections.supportsReasoning(saved.id(), "model-a", "high"));
            assertFalse(connections.supportsReasoning(saved.id(), "model-b", "high"));
            status.set(401);
            var cached = connections.refreshModels(saved.id(), new ModelDiscovery());
            assertEquals(discovered.discoveredAt(), cached.discoveredAt());
            assertEquals(2, cached.models().size()); assertEquals("MODEL_DISCOVERY_HTTP_401", cached.discoveryError());
            assertFalse(cached.toString().contains("local-secret")); assertEquals(2, calls.get());
            connections.configureModels(saved.id(), cached.models(), List.of("model-b"), "model-b");
            assertThrows(ResponseStatusException.class, () -> connections.requireModel(saved.id(), "model-a"));
            assertEquals("model-b", connections().effectiveDefault().model);
        } finally { server.stop(0); }
    }

    @Test void neverForwardsCredentialsThroughRedirects() throws Exception {
        var forwarded = new AtomicInteger();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/models", exchange -> { exchange.getResponseHeaders().add("Location", "/capture"); exchange.sendResponseHeaders(302, -1); exchange.close(); });
        server.createContext("/capture", exchange -> { forwarded.incrementAndGet(); exchange.sendResponseHeaders(200, -1); exchange.close(); });
        server.start();
        try {
            var connections = connections();
            var saved = connections.create("local", "http://127.0.0.1:" + server.getAddress().getPort(), "local-secret", true, true);
            assertEquals("MODEL_DISCOVERY_HTTP_302", connections.refreshModels(saved.id(), new ModelDiscovery()).discoveryError());
            assertEquals(0, forwarded.get());
        } finally { server.stop(0); }
    }

    @Test void oldSingleModelFieldDoesNotBecomeAnAllowedModel() throws Exception {
        var id = java.util.UUID.randomUUID();
        java.nio.file.Files.writeString(root.resolve("connections.json"), "{\"connections\":[{\"id\":\"" + id + "\",\"name\":\"old\",\"kind\":\"openai-compatible\",\"baseUrl\":\"https://example.test\",\"model\":\"legacy\",\"secret\":\"secret\",\"enabled\":true,\"revision\":1,\"defaultSelected\":true}]}");
        var connections = connections();
        assertTrue(connections.list().items().getFirst().models().isEmpty());
        assertNull(connections.effectiveDefault());
        assertThrows(ResponseStatusException.class, () -> connections.requireModel(id, "legacy"));
    }
}
