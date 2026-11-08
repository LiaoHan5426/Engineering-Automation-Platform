package com.lh.eap.llm;

import java.net.URI;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.ai.chat.model.ChatModel;
import com.lh.eap.ai.AiErrors;

/** Compatibility bridge for the deterministic pipeline; Spring AI owns model transport. */
@Component
public class OpenAiCompatibleProvider implements LlmProvider {
    public static final String ID = "openai-compatible";
    private final ChatClient client;
    private final String model;
    private final URI endpoint;
    private final boolean enabled;
    private final com.lh.eap.ai.ModelConnections connections;

    public OpenAiCompatibleProvider(ObjectProvider<ChatClient.Builder> builders, ObjectProvider<ChatModel> models,
            @Value("${eap.llm.enabled:false}") boolean enabled,
            @Value("${spring.ai.openai.chat.options.model:gpt-4.1-mini}") String model,
            @Value("${spring.ai.openai.base-url:https://api.openai.com}") String baseUrl) {
        this(builders, models, enabled, model, baseUrl, null);
    }

    @Autowired
    public OpenAiCompatibleProvider(ObjectProvider<ChatClient.Builder> builders, ObjectProvider<ChatModel> models,
            ObjectProvider<com.lh.eap.ai.ModelConnections> connections,
            @Value("${eap.llm.enabled:false}") boolean enabled,
            @Value("${spring.ai.openai.chat.options.model:gpt-4.1-mini}") String model,
            @Value("${spring.ai.openai.base-url:https://api.openai.com}") String baseUrl) {
        this(builders, models, enabled, model, baseUrl, connections.getIfAvailable());
    }

    private OpenAiCompatibleProvider(ObjectProvider<ChatClient.Builder> builders, ObjectProvider<ChatModel> models,
            boolean enabled, String model, String baseUrl, com.lh.eap.ai.ModelConnections connections) {
        var builder = connections == null && enabled && models.getIfAvailable() != null ? builders.getIfAvailable() : null;
        this.client = builder == null ? null : builder.build();
        this.model = model;
        this.endpoint = URI.create(baseUrl);
        this.enabled = enabled;
        this.connections = connections;
    }
    @Override public String id() { return ID; }
    @Override public LlmProvider forRequest() {
        if (connections == null) return this;
        var snapshot = connections.effectiveDefault();
        return new LlmProvider() {
            public String id() { return ID; }
            public boolean available() { return enabled && snapshot != null && snapshot.usable(); }
            public String model() { return snapshot == null ? "" : snapshot.model; }
            public String cacheScope() { return snapshot == null ? ID + ":unconfigured" : ID + ":" + snapshot.id + ":" + snapshot.revision + ":" + snapshot.model; }
            public Result complete(Request request) { return completeSnapshot(request, snapshot); }
        };
    }
    @Override public boolean available() {
        if (connections != null) {
            var current = connections.effectiveDefault();
            return enabled && current != null && current.usable();
        }
        return client != null;
    }
    @Override public String model() {
        if (connections != null) {
            var current = connections.effectiveDefault();
            return current == null ? "" : current.model;
        }
        return model;
    }
    @Override public String cacheScope() {
        if (connections == null) return id() + ":" + model;
        var current = connections.effectiveDefault();
        if (current == null) return id() + ":unconfigured";
        return id() + ":" + current.id + ":" + current.revision + ":" + current.model;
    }
    @Override public Result complete(Request request) {
        var snapshot = connections == null ? null : connections.effectiveDefault();
        return completeSnapshot(request, snapshot);
    }

    private Result completeSnapshot(Request request, com.lh.eap.ai.ModelConnectionSnapshot snapshot) {
        var active = snapshot == null ? client : connections.completionClient(snapshot);
        var selectedModel = snapshot == null ? model : snapshot.model;
        if (active == null) return Result.failure(ID, "AI_NOT_CONFIGURED");
        long started = System.nanoTime();
        try {
            var response = active.prompt().system(request.systemPrompt()).user(request.userPrompt())
                    .options(ChatOptions.builder().model(selectedModel).temperature(request.temperature())
                            .maxTokens(request.maxTokens())).call().chatResponse();
            if (response == null || response.getResult() == null || response.getResult().getOutput().getText() == null
                    || response.getResult().getOutput().getText().isBlank())
                return Result.failure(ID, "AI_EMPTY_RESPONSE");
            var usage = response.getMetadata().getUsage();
            return new Result(true, response.getResult().getOutput().getText(), ID, selectedModel,
                    (System.nanoTime() - started) / 1_000_000,
                    usage.getPromptTokens(), usage.getCompletionTokens(), null);
        } catch (RuntimeException failure) {
            return Result.failure(ID, AiErrors.classify(failure));
        }
    }
    public URI endpoint() { return endpoint; }
}
