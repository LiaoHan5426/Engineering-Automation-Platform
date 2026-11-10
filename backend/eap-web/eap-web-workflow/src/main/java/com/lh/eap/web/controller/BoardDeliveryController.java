package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardDeliveryService;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/board/tasks/{taskId}/runs/{executionId}/delivery")
public class BoardDeliveryController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final BoardDeliveryService service;
    public BoardDeliveryController(BoardDeliveryService service) { this.service=service; }
    @GetMapping public BoardDeliveryService.Page get(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestParam String projectId) { return service.get(taskId, executionId, projectId); }
    @GetMapping("/applications") public com.lh.eap.application.service.BoardApplicationCatalog.Page applications(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestParam String projectId) {
        return service.applications(taskId, executionId, projectId);
    }
    @PostMapping public BoardDeliveryService.Delivery submit(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestBody String body) {
        var map = fields(body, Set.of("projectId","revision","workspacePath","requestId","paths","note"), Set.of("applicationRef"));
        BoardDeliveryService.ApplicationRef ref = null;
        if (map.containsKey("applicationRef")) {
            if (!(map.get("applicationRef") instanceof Map<?,?> value) || !value.keySet().equals(Set.of("conversationId","proposalId"))) throw invalid();
            ref = new BoardDeliveryService.ApplicationRef(uuid(value,"conversationId"), uuid(value,"proposalId"));
        }
        if (!(map.get("paths") instanceof List<?> paths) || paths.stream().anyMatch(value -> !(value instanceof String))) throw invalid();
        return service.submit(taskId, executionId, new BoardDeliveryService.Request(string(map,"projectId"), revision(map), string(map,"workspacePath"), uuid(map,"requestId"), paths.stream().map(String.class::cast).toList(), string(map,"note"), ref));
    }
    @PostMapping("/decision") public BoardDeliveryService.Delivery decide(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestBody String body) {
        var map = fields(body, Set.of("projectId","revision","requestId","deliveryId","decision","criteriaConfirmed","previewConfirmed","comment"));
        return service.decide(taskId, executionId, new BoardDeliveryService.Decide(string(map,"projectId"), revision(map), uuid(map,"requestId"), uuid(map,"deliveryId"), string(map,"decision"), bool(map,"criteriaConfirmed"), bool(map,"previewConfirmed"), string(map,"comment")));
    }
    private static Map<?,?> fields(String body, Set<String> keys) { return fields(body, keys, Set.of()); }
    private static Map<?,?> fields(String body, Set<String> keys, Set<String> optional) {
        final Object value;
        try { value = JSON.readValue(body, Object.class); } catch (RuntimeException bad) { throw invalid(); }
        if (!(value instanceof Map<?,?> map) || (!map.keySet().containsAll(keys) || map.keySet().stream().anyMatch(key -> !keys.contains(key) && !optional.contains(key)))) throw invalid();
        return map;
    }
    private static String string(Map<?,?> map, String key) { if (!(map.get(key) instanceof String value)) throw invalid(); return value; }
    private static UUID uuid(Map<?,?> map, String key) { String value=string(map,key); if (!value.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) throw invalid(); return UUID.fromString(value); }
    private static long revision(Map<?,?> map) { Object value=map.get("revision"); if (!(value instanceof Integer || value instanceof Long) || ((Number)value).longValue()<1) throw invalid(); return ((Number)value).longValue(); }
    private static boolean bool(Map<?,?> map, String key) { if (!(map.get(key) instanceof Boolean value)) throw invalid(); return value; }
    private static IllegalArgumentException invalid() { return new IllegalArgumentException("INVALID_BOARD_DELIVERY_REQUEST"); }
}
