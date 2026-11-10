package com.lh.eap.web.controller;
import com.lh.eap.web.i18n.ProblemResponses;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ProblemDetail;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.CommonErrors;
import com.lh.eap.error.ToolErrors;

import com.lh.eap.application.service.ToolExecution;
import com.lh.eap.application.service.ToolExecutionService;
import com.lh.eap.application.service.ToolProcessReview;
import com.lh.eap.application.service.ToolExecutionReadiness;
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
    private final ProblemResponses problems;
    public ToolExecutionController(ToolExecutionService service, ProblemResponses problems) { this.service = service; this.problems = problems; }
    @PostMapping @ResponseStatus(HttpStatus.ACCEPTED)
    public ToolExecution start(@PathVariable String operation, @RequestBody Map<String, Object> body) {
        if (body.size() != 1 || !(body.get("requestId") instanceof String request))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, CommonErrors.ONLY_REQUEST_ID_ALLOWED.code());
        try {
            var id = UUID.fromString(request);
            if (!id.toString().equalsIgnoreCase(request)) throw new IllegalArgumentException("Noncanonical UUID");
            return service.start(operation, id);
        }
        catch (IllegalArgumentException invalid) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, CommonErrors.INVALID_REQUEST_ID.code()); }
    }
    @GetMapping public Map<String, Object> list(@PathVariable String operation, @RequestParam(defaultValue = "20") int limit) {
        return Map.of("items", service.list(operation, limit));
    }
    @GetMapping("/readiness") public ToolExecutionReadiness readiness(@PathVariable String operation) {
        return service.readiness(operation);
    }
    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail persistenceUnavailable(HttpServletRequest request, HttpServletResponse response) {
        // A failed write response does not tell the client whether a transaction committed.
        return problems.create(503, ToolErrors.TOOL_EXECUTION_STORE_UNAVAILABLE.code(), request, response);
    }
    @GetMapping("/{id}") public ToolExecution get(@PathVariable String operation, @PathVariable UUID id) { return service.get(operation, id); }
    @PostMapping("/{id}/cancel") public ToolExecution cancel(@PathVariable String operation, @PathVariable UUID id) { return service.cancel(operation, id); }
    @GetMapping("/{id}/process-review")
    public ToolProcessReview inspectProcesses(@PathVariable String operation, @PathVariable UUID id) {
        return service.inspectProcesses(operation, id);
    }
    @PostMapping("/{id}/resolve-unknown")
    public ToolExecution resolveUnknown(@PathVariable String operation, @PathVariable UUID id,
                                       @RequestBody Map<String, Object> body) {
        if (body.size() != 3 || !(body.get("requestId") instanceof String request)
                || !(body.get("note") instanceof String note) || !Boolean.TRUE.equals(body.get("processTreeStopped")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ExecutionErrors.UNKNOWN_REVIEW_REQUIRED.code());
        final UUID requestId;
        try {
            requestId = UUID.fromString(request);
            if (!requestId.toString().equalsIgnoreCase(request)) throw new IllegalArgumentException("Noncanonical UUID");
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, CommonErrors.INVALID_REQUEST_ID.code());
        }
        return service.resolveUnknown(operation, id, requestId, note, true);
    }
    @ExceptionHandler(ToolExecutionService.Blocked.class)
    public ProblemDetail blocked(ToolExecutionService.Blocked blocked, HttpServletRequest request, HttpServletResponse response) {
        var result = problems.create(409, ToolErrors.TOOL_EXECUTION_BLOCKED.code(), request, response);
        result.setProperty("execution", blocked.execution());
        return result;
    }
}
