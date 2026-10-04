package com.lh.eap.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.*;

@Service
public class SqlExpertService {
    private final boolean enabled;
    private final String model;
    private final RestClient client;

    public SqlExpertService(@Value("${eap.llm.enabled:false}") boolean enabled, @Value("${eap.llm.base-url:http://127.0.0.1:1234/v1}") String baseUrl, @Value("${eap.llm.model:local-model}") String model) {
        this.enabled = enabled;
        this.model = model;
        this.client = RestClient.builder().baseUrl(baseUrl).build();
    }

    @SuppressWarnings("unchecked")
    public Optional<String> analyze(String sql, List<String> checks) {
        if (!enabled) return Optional.empty();
        var body = Map.of("model", model, "temperature", 0.1, "messages", List.of(Map.of("role", "system", "content", "Analyze SQL performance and safety. Do not invent schema facts."), Map.of("role", "user", "content", "SQL:\n" + sql + "\nLocal checks:\n" + String.join("\n", checks))));
        try {
            var response = client.post().uri("/chat/completions").body(body).retrieve().body(Map.class);
            var choices = (List<Map<String, Object>>) response.get("choices");
            var message = (Map<String, Object>) choices.getFirst().get("message");
            return Optional.ofNullable(String.valueOf(message.get("content")));
        } catch (RuntimeException ex) {
            return Optional.empty();
        }
    }
}
