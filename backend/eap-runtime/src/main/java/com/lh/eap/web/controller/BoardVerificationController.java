package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardVerificationService;
import com.lh.eap.application.service.BoardVerificationPlanSupport;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import tools.jackson.databind.json.JsonMapper;

@RestController
@RequestMapping("/api/board/tasks/{taskId}/runs/{executionId}/verification")
public class BoardVerificationController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final BoardVerificationService verification;
    public BoardVerificationController(BoardVerificationService verification) { this.verification = verification; }
    @GetMapping public BoardVerificationService.Page get(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestParam String projectId) {
        return verification.get(taskId, executionId, projectId);
    }
    @PostMapping("/plan") public BoardVerificationPlanSupport.Plan plan(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestBody String body) {
        var fields = fields(body, Set.of("projectId", "workspacePath"));
        return verification.plan(taskId, executionId, new BoardVerificationService.Request((String)fields.get("projectId"), (String)fields.get("workspacePath")));
    }
    @PostMapping public BoardVerificationService.Record start(@PathVariable UUID taskId, @PathVariable UUID executionId, @RequestBody String body) {
        var fields = fields(body, Set.of("projectId", "workspacePath", "planHash"));
        return verification.start(taskId, executionId, new BoardVerificationService.Start((String)fields.get("projectId"), (String)fields.get("workspacePath"), (String)fields.get("planHash")));
    }
    private static Map<?,?> fields(String body, Set<String> keys) {
        final Object parsed;
        try { parsed = JSON.readValue(body, Object.class); }
        catch (RuntimeException invalid) { throw new IllegalArgumentException("INVALID_BOARD_VERIFICATION_REQUEST"); }
        if (!(parsed instanceof Map<?,?> fields) || !fields.keySet().equals(keys) || fields.values().stream().anyMatch(value -> !(value instanceof String))) throw new IllegalArgumentException("INVALID_BOARD_VERIFICATION_REQUEST");
        return fields;
    }
}
