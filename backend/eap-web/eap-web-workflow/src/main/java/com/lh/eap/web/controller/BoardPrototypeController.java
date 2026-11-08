package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardPrototypeService;
import com.lh.eap.application.service.BoardTaskService;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/board/tasks/{taskId}/prototype")
public class BoardPrototypeController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> FIELDS = Set.of("projectId", "revision", "versionId");
    private final BoardPrototypeService prototypes;
    public BoardPrototypeController(BoardPrototypeService prototypes) { this.prototypes = prototypes; }
    @PostMapping public BoardTaskService.Task select(@PathVariable UUID taskId, @RequestBody String body) {
        final Object parsed;
        try { parsed = JSON.readValue(body, Object.class); }
        catch (RuntimeException invalid) { throw new IllegalArgumentException("INVALID_BOARD_PROTOTYPE_REQUEST"); }
        if (!(parsed instanceof Map<?, ?> fields) || !fields.keySet().equals(FIELDS)
                || !(fields.get("projectId") instanceof String project)
                || !(fields.get("revision") instanceof Integer || fields.get("revision") instanceof Long)
                || (fields.get("versionId") != null && !(fields.get("versionId") instanceof String))) {
            throw new IllegalArgumentException("INVALID_BOARD_PROTOTYPE_REQUEST");
        }
        var version = fields.get("versionId") == null ? null : UUID.fromString((String) fields.get("versionId"));
        return prototypes.select(taskId, new BoardPrototypeService.Selection(project, ((Number) fields.get("revision")).longValue(), version));
    }
}
