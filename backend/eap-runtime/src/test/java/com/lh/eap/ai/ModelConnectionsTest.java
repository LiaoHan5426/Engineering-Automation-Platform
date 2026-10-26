package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.llm.LlmGateway;
import com.lh.eap.llm.LlmProvider;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import tools.jackson.databind.json.JsonMapper;

class ModelConnectionsTest {
    private static final String SECRET = "sk-local-test-secret";
    @TempDir Path root;

    @Test void startsUnconfiguredWithoutAnImplicitLegacyModel() {
        var connections = connections("openai", "env-model", SECRET);
        assertNull(connections.effectiveDefault());
        assertTrue(connections.list().items().isEmpty());
        var saved = createConfigured(connections, "desk", "https://127.0.0.1:9/v1", "desk-model", SECRET, true, false);
        assertNull(connections.effectiveDefault());
        connections.setDefault(saved.id());
        assertEquals(saved.id(), connections.effectiveDefault().id);
        connections.setEnabled(saved.id(), false);
        assertNull(connections.effectiveDefault());
        assertEquals(1, connections.list().items().size());
    }

    @Test void secretStaysOutOfTheViewAndARevisionKeepsItsClient() throws Exception {
        var connections = new ModelConnections(root.resolve("clients.json"), false, new ModelClientSource() {
                    public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                        return ChatClient.builder(FakeChatModels.scripted(prompt -> FakeChatModels.text("offline"))).build();
                    }
                    public ChatClient completion(ModelConnectionSnapshot snapshot) { return conversational(snapshot); }
                });
        var saved = createConfigured(connections, "desk", "https://127.0.0.1:9/v1", "desk-model", SECRET, true, true);
        assertTrue(saved.secretPresent());
        assertFalse(saved.toString().contains(SECRET));
        assertFalse(JsonMapper.builder().build().writeValueAsString(connections.list()).contains(SECRET));
        var first = connections.require(saved.id());
        assertFalse(first.toString().contains(SECRET));
        var original = connections.chatClient(first);
        var renamed = connections.update(saved.id(), "renamed", first.baseUrl, "", true, true);
        assertEquals(saved.revision(), renamed.revision());
        assertSame(original, connections.chatClient(connections.require(saved.id())));
        var edited = connections.update(saved.id(), "renamed", first.baseUrl, "changed-secret", true, true);
        assertTrue(edited.revision() > saved.revision());
        assertNotSame(original, connections.chatClient(connections.require(saved.id())));
        assertSame(original, connections.chatClient(first));
    }

    @Test void sqlCacheFollowsConnectionScopeAndStillFailsClosed() {
        var scope = new AtomicReference<>("openai-compatible:one:1:m");
        var calls = new AtomicInteger();
        LlmProvider provider = new LlmProvider() {
            public String id() { return "openai-compatible"; }
            public boolean available() { return true; }
            public String model() { return "m"; }
            public String cacheScope() { return scope.get(); }
            public Result complete(Request request) {
                calls.incrementAndGet();
                return new Result(true, "answer", id(), model(), 1, 1, 1, null);
            }
        };
        var gateway = new LlmGateway(List.of(provider), 8);
        var request = new LlmProvider.Request("system", "user", 0.1, 16, "same");
        assertTrue(gateway.complete(request).isPresent());
        assertTrue(gateway.complete(request).isPresent());
        assertEquals(1, calls.get());
        scope.set("openai-compatible:one:2:m");
        assertTrue(gateway.complete(request).isPresent());
        assertEquals(2, calls.get());
        var unavailable = new LlmGateway(List.of(), 8);
        var failure = unavailable.completeWithEvidence(request);
        assertFalse(failure.ok());
        assertEquals("AI_NOT_CONFIGURED", failure.error());
    }

    private ModelConnections connections(String provider, String model, String secret) {
        return new ModelConnections(root.resolve("connections.json"), false, new ModelClientSource() {
                    public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                        throw new AssertionError("client source called for " + snapshot);
                    }
                    public ChatClient completion(ModelConnectionSnapshot snapshot) { return conversational(snapshot); }
                });
    }

    @Test void sqlSelectionAndCacheScopeStayOnOneSnapshotDuringDefaultChange() {
        var connections = new ModelConnections(root.resolve("sql.json"), false,
                new ModelClientSource() {
                    public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                        return ChatClient.builder(FakeChatModels.scripted(prompt -> FakeChatModels.text(snapshot.model))).build();
                    }
                    public ChatClient completion(ModelConnectionSnapshot snapshot) { return conversational(snapshot); }
                });
        var first = createConfigured(connections, "first", "https://api.openai.com", "model-a", SECRET, true, true);
        var beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
        beans.registerSingleton("connections", connections);
        var provider = new com.lh.eap.llm.OpenAiCompatibleProvider(beans.getBeanProvider(ChatClient.Builder.class),
                beans.getBeanProvider(org.springframework.ai.chat.model.ChatModel.class), beans.getBeanProvider(ModelConnections.class), true, "", "https://api.openai.com");
        var selected = provider.forRequest();
        createConfigured(connections, "second", "https://api.openai.com", "model-b", SECRET, true, true);
        var result = selected.complete(new LlmProvider.Request("system", "user", 0.1, 16, "same"));
        assertTrue(selected.cacheScope().contains(first.id().toString()));
        assertEquals("model-a", result.model());
        assertEquals("model-a", result.text());
        assertEquals("model-b", provider.forRequest().model());
    }
    private static ModelConnectionView createConfigured(ModelConnections connections, String name, String url, String model,
            String secret, boolean enabled, boolean makeDefault) {
        var saved = connections.create(name, url, secret, enabled, makeDefault);
        return connections.configureModels(saved.id(), List.of(new ModelOption(model, List.of())), List.of(model), model);
    }
}
