package com.lh.eap.llm;

import java.net.URI;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.beans.factory.ObjectProvider;
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

    public OpenAiCompatibleProvider(ObjectProvider<ChatClient.Builder> builders, ObjectProvider<ChatModel> models,
            @Value("${eap.llm.enabled:false}") boolean enabled,
            @Value("${spring.ai.openai.chat.options.model:gpt-4.1-mini}") String model,
            @Value("${spring.ai.openai.base-url:https://api.openai.com}") String baseUrl) {
        var builder = enabled && models.getIfAvailable() != null ? builders.getIfAvailable() : null;
        this.client = builder == null ? null : builder.build();
        this.model = model;
        this.endpoint = URI.create(baseUrl);
    }
    @Override public String id() { return ID; }
    @Override public boolean available() { return client != null; }
    @Override public String model() { return model; }
    @Override public Result complete(Request request) {
        if (client == null) return Result.failure(ID, "AI_NOT_CONFIGURED");
        long started = System.nanoTime();
        try {
            var response = client.prompt().system(request.systemPrompt()).user(request.userPrompt())
                    .options(ChatOptions.builder().model(model).temperature(request.temperature())
                            .maxTokens(request.maxTokens())).call().chatResponse();
            if (response == null || response.getResult() == null || response.getResult().getOutput().getText() == null
                    || response.getResult().getOutput().getText().isBlank())
                return Result.failure(ID, "AI_EMPTY_RESPONSE");
            var usage = response.getMetadata().getUsage();
            return new Result(true, response.getResult().getOutput().getText(), ID, model,
                    (System.nanoTime() - started) / 1_000_000,
                    usage.getPromptTokens(), usage.getCompletionTokens(), null);
        } catch (RuntimeException failure) {
            return Result.failure(ID, AiErrors.classify(failure));
        }
    }
    public URI endpoint() { return endpoint; }
}
