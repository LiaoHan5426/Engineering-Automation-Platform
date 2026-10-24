package com.lh.eap.web.controller;

import com.lh.eap.application.service.PrototypeDelivery;
import com.lh.eap.application.service.PrototypeVersion;
import com.lh.eap.application.service.PrototypeVersionService;
import java.util.ArrayList;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api")
public class PrototypeVersionController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> VERSION_FIELDS = Set.of("sourceRef", "title", "body", "buttonPresses", "acceptance");
    private static final Set<String> DELIVERY_FIELDS = Set.of("versionId");
    private final PrototypeVersionService versions;

    public PrototypeVersionController(PrototypeVersionService versions) {
        this.versions = versions;
    }

    @GetMapping("/prototype-versions")
    public Map<String, List<PrototypeVersion>> list(@RequestParam String sourceRef) {
        return Map.of("items", versions.list(sourceRef));
    }

    @GetMapping("/prototype-versions/{id}")
    public PrototypeVersion detail(@PathVariable UUID id) {
        return versions.find(id);
    }

    @PostMapping("/prototype-versions")
    public PrototypeVersion save(@RequestBody(required = false) String body) {
        var parsed = objectBody(body, VERSION_FIELDS, "原型版本");
        if (!(parsed.get("sourceRef") instanceof String sourceRef)
                || !(parsed.get("title") instanceof String title)
                || !(parsed.get("body") instanceof String text)
                || !(parsed.get("buttonPresses") instanceof Integer presses)
                || !(parsed.get("acceptance") instanceof List<?> acceptance)) {
            throw new IllegalArgumentException("原型版本字段类型不正确");
        }
        var conditions = new ArrayList<String>();
        for (var item : acceptance) {
            if (!(item instanceof String condition)) throw new IllegalArgumentException("验收条件必须是文本");
            conditions.add(condition);
        }
        return versions.save(sourceRef, title, text, presses, conditions);
    }

    @PostMapping("/prototype-deliveries")
    public PrototypeDelivery deliver(@RequestBody(required = false) String body) {
        var parsed = objectBody(body, DELIVERY_FIELDS, "交付单");
        if (!(parsed.get("versionId") instanceof String versionId)) {
            throw new IllegalArgumentException("交付单只接受版本号");
        }
        return versions.deliver(UUID.fromString(versionId));
    }

    private static Map<String, Object> objectBody(String json, Set<String> fields, String name) {
        if (json == null || json.isBlank()) throw new IllegalArgumentException(name + "请求不能为空");
        final Object parsed;
        try {
            parsed = JSON.readValue(json, Object.class);
        } catch (RuntimeException invalid) {
            throw new IllegalArgumentException(name + "请求不是 JSON 对象");
        }
        if (!(parsed instanceof Map<?, ?> raw)) throw new IllegalArgumentException(name + "请求不是 JSON 对象");
        var body = new LinkedHashMap<String, Object>();
        for (var entry : raw.entrySet()) {
            if (!(entry.getKey() instanceof String field) || !fields.contains(field)) {
                throw new IllegalArgumentException(name + "请求含有不允许的字段");
            }
            body.put(field, entry.getValue());
        }
        return body;
    }
}
