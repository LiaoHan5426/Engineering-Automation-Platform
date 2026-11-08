package com.lh.eap.web.controller;

import com.lh.eap.application.service.MissionExecution;
import com.lh.eap.application.service.MissionGitExecutionService;
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
@RequestMapping("/api/missions/{missionId}/executions")
public class MissionExecutionController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> FIELDS = Set.of("missionId");
    private final MissionGitExecutionService executions;

    public MissionExecutionController(MissionGitExecutionService executions) {
        this.executions = executions;
    }

    @GetMapping
    public Map<String, List<MissionExecution>> list(@PathVariable UUID missionId) {
        return Map.of("items", executions.list(missionId));
    }

    @PostMapping
    public MissionExecution start(@PathVariable UUID missionId, @RequestBody(required = false) String body) {
        var parsed = objectBody(body);
        if (parsed.get("missionId") instanceof String supplied && !missionId.toString().equals(supplied)) {
            throw new IllegalArgumentException("任务壳标识不一致");
        }
        return executions.start(missionId);
    }

    @PostMapping("/{executionId}/cancel")
    public MissionExecution cancel(@PathVariable UUID missionId, @PathVariable UUID executionId) {
        return executions.cancel(missionId, executionId);
    }

    private static Map<String, Object> objectBody(String json) {
        if (json == null || json.isBlank()) return Map.of();
        final Object parsed;
        try {
            parsed = JSON.readValue(json, Object.class);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException("执行请求不是 JSON 对象");
        }
        if (!(parsed instanceof Map<?, ?> raw)) {
            throw new IllegalArgumentException("执行请求不是 JSON 对象");
        }
        var body = new LinkedHashMap<String, Object>();
        for (var entry : raw.entrySet()) {
            if (!(entry.getKey() instanceof String name) || !FIELDS.contains(name)) {
                throw new IllegalArgumentException("执行请求含有不允许的字段");
            }
            body.put(name, entry.getValue());
        }
        return body;
    }
}
