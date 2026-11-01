package com.lh.eap.web.controller;

import com.lh.eap.application.service.Mission;
import com.lh.eap.application.service.MissionService;
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
@RequestMapping("/api/missions")
public class MissionController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> FIELDS = Set.of("handoffId");
    private final MissionService missions;

    public MissionController(MissionService missions) {
        this.missions = missions;
    }

    @GetMapping
    public Map<String, List<Mission>> list() {
        return Map.of("items", missions.list());
    }

    @GetMapping("/{id}")
    public Mission detail(@PathVariable UUID id) {
        return missions.detail(id);
    }

    @PostMapping
    public Mission create(@RequestBody(required = false) String body) {
        var parsed = objectBody(body);
        if (!(parsed.get("handoffId") instanceof String handoffId)) {
            throw new IllegalArgumentException("交接标识必须是文本");
        }
        try {
            return missions.create(UUID.fromString(handoffId));
        } catch (IllegalArgumentException invalid) {
            throw new IllegalArgumentException("交接标识无效");
        }
    }

    private static Map<String, Object> objectBody(String json) {
        if (json == null || json.isBlank()) {
            throw new IllegalArgumentException("任务壳请求不能为空");
        }
        final Object parsed;
        try {
            parsed = JSON.readValue(json, Object.class);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("任务壳请求不是 JSON 对象");
        }
        if (!(parsed instanceof Map<?, ?> raw)) {
            throw new IllegalArgumentException("任务壳请求不是 JSON 对象");
        }
        var body = new LinkedHashMap<String, Object>();
        for (var entry : raw.entrySet()) {
            if (!(entry.getKey() instanceof String name) || !FIELDS.contains(name)) {
                throw new IllegalArgumentException("任务壳请求含有不允许的字段");
            }
            body.put(name, entry.getValue());
        }
        return body;
    }
}
