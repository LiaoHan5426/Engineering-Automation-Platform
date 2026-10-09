package com.lh.eap.llm;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * A provider for any OpenAI-compatible {@code /chat/completions} endpoint (LM Studio, vLLM, or a
 * gated cloud endpoint). It applies the {@link EndpointPolicy}, sets tight timeouts, and never
 * throws: every failure becomes a failed {@link LlmProvider.Result} so the caller keeps the
 * deterministic result.
 */
@Component
public class OpenAiCompatibleProvider implements LlmProvider {
    private static final Logger log = LoggerFactory.getLogger(OpenAiCompatibleProvider.class);
    public static final String ID = "openai-compatible";

    private final boolean enabled;
    private final boolean permitted;
    private final String model;
    private final RestClient client;

    public OpenAiCompatibleProvider(
            @Value("${eap.llm.enabled:false}") boolean enabled,
            @Value("${eap.llm.base-url:http://127.0.0.1:1234/v1}") String baseUrl,
            @Value("${eap.llm.model:local-model}") String model,
            @Value("${EAP_LLM_ALLOW_REMOTE:false}") boolean allowRemote,
            @Value("${eap.llm.connect-timeout-ms:3000}") int connectTimeoutMs,
            @Value("${eap.llm.read-timeout-ms:20000}") int readTimeoutMs) {
        this.model = model;
        this.permitted = EndpointPolicy.permits(baseUrl, allowRemote);
        this.enabled = enabled && permitted;
        if (enabled && !permitted) {
            log.warn("Model provider disabled: endpoint failed the endpoint policy; deterministic capabilities remain available");
        }
        var factory = new JdkClientHttpRequestFactory(
                HttpClient.newBuilder().connectTimeout(Duration.ofMillis(connectTimeoutMs)).build());
        factory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        this.client = RestClient.builder()
                .baseUrl(permitted ? baseUrl : "http://127.0.0.1:1234/v1")
                .requestFactory(factory)
                .build();
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public boolean available() {
        return enabled;
    }

    @Override
    public String model() {
        return model;
    }

    @Override
    @SuppressWarnings("unchecked")
    public Result complete(Request request) {
        if (!enabled) return Result.failure(ID, "provider-disabled");
        var body = Map.of(
                "model", model,
                "temperature", request.temperature(),
                "max_tokens", request.maxTokens(),
                "messages", List.of(
                        Map.of("role", "system", "content", request.systemPrompt()),
                        Map.of("role", "user", "content", request.userPrompt())));
        long started = System.nanoTime();
        try {
            var response = client.post().uri("/chat/completions").body(body).retrieve().body(Map.class);
            long latency = (System.nanoTime() - started) / 1_000_000;
            if (response == null) return Result.failure(ID, "empty-response");
            var choices = (List<Map<String, Object>>) response.get("choices");
            if (choices == null || choices.isEmpty()) return Result.failure(ID, "no-choices");
            var message = (Map<String, Object>) choices.getFirst().get("message");
            var content = message == null ? null : message.get("content");
            if (!(content instanceof String text) || text.isBlank()) return Result.failure(ID, "blank-content");
            var usage = (Map<String, Object>) response.get("usage");
            int promptTokens = usage == null ? 0 : intValue(usage.get("prompt_tokens"));
            int completionTokens = usage == null ? 0 : intValue(usage.get("completion_tokens"));
            return new Result(true, text, ID, model, latency, promptTokens, completionTokens, null);
        } catch (RuntimeException failure) {
            log.warn("Model call failed ({}); deterministic results remain available", failure.getClass().getSimpleName());
            return Result.failure(ID, failure.getClass().getSimpleName());
        }
    }

    private static int intValue(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    /** Exposed for diagnostics only. */
    public URI endpoint() {
        return URI.create("http://127.0.0.1:1234/v1");
    }
}
