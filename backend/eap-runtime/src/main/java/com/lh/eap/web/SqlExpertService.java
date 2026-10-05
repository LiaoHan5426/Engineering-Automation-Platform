package com.lh.eap.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import java.net.http.HttpClient;
import java.time.Duration;
import java.net.URI;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

@Service
public class SqlExpertService {
    private static final Logger log=LoggerFactory.getLogger(SqlExpertService.class);
    private final boolean enabled;
    private final String model;
    private final RestClient client;

    public SqlExpertService(@Value("${eap.llm.enabled:false}") boolean enabled, @Value("${eap.llm.base-url:http://127.0.0.1:1234/v1}") String baseUrl, @Value("${eap.llm.model:local-model}") String model,@Value("${EAP_LLM_ALLOW_REMOTE:false}") boolean allowRemote) {
        boolean permitted=false;
        try{
            var uri=URI.create(baseUrl);
            var local=Set.of("localhost","127.0.0.1","::1","[::1]").contains(Objects.toString(uri.getHost(),"").toLowerCase(Locale.ROOT));
            permitted=uri.getUserInfo()==null&&(local&&Set.of("http","https").contains(Objects.toString(uri.getScheme(),""))||allowRemote&&"https".equals(uri.getScheme()));
        }catch(IllegalArgumentException ignored){}
        this.enabled = enabled&&permitted;
        if(enabled&&!permitted)log.warn("Model enhancement disabled: endpoint is not permitted; deterministic capabilities remain available");
        this.model = model;
        var factory=new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        factory.setReadTimeout(Duration.ofSeconds(8));
        this.client = RestClient.builder().baseUrl(permitted?baseUrl:"http://127.0.0.1:1234/v1").requestFactory(factory).build();
    }

    @SuppressWarnings("unchecked")
    public Optional<String> analyze(String sql, List<String> checks) {
        if (!enabled) return Optional.empty();
        var body = Map.of("model", model, "temperature", 0.1, "messages", List.of(Map.of("role", "system", "content", "Analyze SQL performance and safety. Do not invent schema facts."), Map.of("role", "user", "content", "SQL:\n" + sql + "\nLocal checks:\n" + String.join("\n", checks))));
        try {
            var response = client.post().uri("/chat/completions").body(body).retrieve().body(Map.class);
            if(response==null)return Optional.empty();
            var choices = (List<Map<String, Object>>) response.get("choices");
            if(choices==null||choices.isEmpty())return Optional.empty();
            var message = (Map<String, Object>) choices.getFirst().get("message");
            var content=message==null?null:message.get("content");
            return content instanceof String text&&!text.isBlank()?Optional.of(text):Optional.empty();
        } catch (RuntimeException ex) {
            log.warn("Optional model enhancement failed: {}; deterministic results remain available",ex.getClass().getSimpleName());
            return Optional.empty();
        }
    }
}
