package com.lh.eap.web.controller;

import com.lh.eap.application.service.ToolExecution;
import com.lh.eap.application.service.ToolExecutionService;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Whitelisted built-in routes: no arbitrary program, argv, cwd or capability execution API. */
@RestController
@RequestMapping("/api/cli-programs/git/operations/{operation:git-status|git-diff}/executions")
public class ToolExecutionController {
    private final ToolExecutionService service;
    public ToolExecutionController(ToolExecutionService service) { this.service = service; }
    @PostMapping @ResponseStatus(HttpStatus.ACCEPTED)
    public ToolExecution start(@PathVariable String operation, @RequestBody Map<String, Object> body) {
        if (body.size() != 1 || !(body.get("requestId") instanceof String request))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ONLY_REQUEST_ID_ALLOWED");
        try {
            var id = UUID.fromString(request);
            if (!id.toString().equalsIgnoreCase(request)) throw new IllegalArgumentException("Noncanonical UUID");
            return service.start(operation, id);
        }
        catch (IllegalArgumentException invalid) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_ID"); }
    }
    @GetMapping public Map<String, Object> list(@PathVariable String operation, @RequestParam(defaultValue = "20") int limit) {
        return Map.of("items", service.list(operation, limit));
    }
    @GetMapping("/{id}") public ToolExecution get(@PathVariable String operation, @PathVariable UUID id) { return service.get(operation, id); }
    @PostMapping("/{id}/cancel") public ToolExecution cancel(@PathVariable String operation, @PathVariable UUID id) { return service.cancel(operation, id); }
    @PostMapping("/{id}/resolve-unknown")
    public ToolExecution resolveUnknown(@PathVariable String operation, @PathVariable UUID id,
                                       @RequestBody Map<String, Object> body) {
        if (body.size() != 3 || !(body.get("requestId") instanceof String request)
                || !(body.get("note") instanceof String note) || !Boolean.TRUE.equals(body.get("processTreeStopped")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "UNKNOWN_REVIEW_REQUIRED");
        final UUID requestId;
        try {
            requestId = UUID.fromString(request);
            if (!requestId.toString().equalsIgnoreCase(request)) throw new IllegalArgumentException("Noncanonical UUID");
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST_ID");
        }
        return service.resolveUnknown(operation, id, requestId, note, true);
    }
    @ExceptionHandler(ToolExecutionService.Blocked.class)
    public ResponseEntity<Map<String, Object>> blocked(ToolExecutionService.Blocked blocked) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("detail", "TOOL_EXECUTION_BLOCKED", "execution", blocked.execution()));
    }
}
