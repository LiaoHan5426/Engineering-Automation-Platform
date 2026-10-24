package com.lh.eap.web.controller;

import com.lh.eap.application.service.Handoff;
import com.lh.eap.application.service.HandoffService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/handoffs")
public class HandoffController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> FIELDS = Set.of("source", "sourceRef", "summary");
    private final HandoffService handoffs;

    public HandoffController(HandoffService handoffs) {
        this.handoffs = handoffs;
    }

    @GetMapping
    public Map<String, List<Handoff>> list() {
        return Map.of("items", handoffs.list());
    }

    @GetMapping("/{id}")
    public Handoff detail(@PathVariable UUID id) {
        return handoffs.detail(id);
    }

    @PostMapping
    public Handoff create(@RequestBody(required = false) String body) {
        var parsed = objectBody(body);
        if (!(parsed.get("source") instanceof String source)
                || !(parsed.get("sourceRef") instanceof String sourceRef)
                || !(parsed.get("summary") instanceof String summary)) {
            throw new IllegalArgumentException("交接字段必须是文本");
        }
        return handoffs.record(source, sourceRef, summary);
    }

    private static Map<String, Object> objectBody(String json) {
        if (json == null || json.isBlank()) {
            throw new IllegalArgumentException("交接请求不能为空");
        }
        final Object parsed;
        try {
            parsed = JSON.readValue(json, Object.class);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("交接请求不是 JSON 对象");
        }
        if (!(parsed instanceof Map<?, ?> raw)) {
            throw new IllegalArgumentException("交接请求不是 JSON 对象");
        }
        var body = new LinkedHashMap<String, Object>();
        for (var entry : raw.entrySet()) {
            if (!(entry.getKey() instanceof String name) || !FIELDS.contains(name)) {
                throw new IllegalArgumentException("交接请求含有不允许的字段");
            }
            body.put(name, entry.getValue());
        }
        return body;
    }
}
