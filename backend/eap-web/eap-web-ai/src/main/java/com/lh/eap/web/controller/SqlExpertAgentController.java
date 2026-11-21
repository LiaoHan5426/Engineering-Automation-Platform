package com.lh.eap.web.controller;
import com.lh.eap.application.service.ExpertAgentApprovalService;
import com.lh.eap.error.AgentErrors;
import org.springframework.beans.factory.annotation.Autowired;

import com.lh.eap.ai.SqlExpertAgentService;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Synchronous bounded runs; caller supplies a UUID so another request can cancel the in-flight run. */
@RestController
@RequestMapping("/api/experts/{expertId}/agent-runs/{executionId}")
public class SqlExpertAgentController {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final SqlExpertAgentService agents;
    private final ExpertAgentApprovalService approvals;
    public SqlExpertAgentController(SqlExpertAgentService agents) { this(agents, null); }
    @Autowired
    public SqlExpertAgentController(SqlExpertAgentService agents, ExpertAgentApprovalService approvals) {
        this.agents = agents; this.approvals = approvals;
    }
    @PostMapping public SqlExpertAgentService.Result execute(@PathVariable String expertId, @PathVariable UUID executionId,
                                                            @RequestBody SqlExpertAgentService.Request request) {
        return agents.execute(expertId, executionId, request);
    }
    @DeleteMapping public Map<String,Object> cancel(@PathVariable String expertId, @PathVariable UUID executionId) {
        return Map.of("id", executionId, "cancelRequested", agents.cancel(expertId, executionId));
    }
    @GetMapping public Map<String,Object> inspect(@PathVariable String expertId, @PathVariable UUID executionId) {
        return approvals.inspect(expertId, executionId);
    }
    @PostMapping("/resume") public SqlExpertAgentService.Result resume(@PathVariable String expertId, @PathVariable UUID executionId) {
        return agents.resume(expertId, executionId);
    }
    @PostMapping("/approval") public Map<String,Object> approve(@PathVariable String expertId, @PathVariable UUID executionId,
            @RequestBody ExpertAgentApprovalService.Review review) {
        return approvals.review(expertId, executionId, review);
    }
    @PostMapping("/resolve-unknown") public Map<String,Object> resolveUnknown(@PathVariable String expertId, @PathVariable UUID executionId,
            @RequestBody(required = false) String body) {
        return approvals.resolveUnknown(expertId, executionId, noteBody(body));
    }
    /** Only the human note is accepted; identity and time are server-owned. */
    private static String noteBody(String json) {
        if (json == null || json.isBlank()) throw badRequest();
        final Object parsed;
        try { parsed = JSON.readValue(json, Object.class); }
        catch (RuntimeException invalid) { throw badRequest(); }
        if (!(parsed instanceof Map<?,?> raw) || raw.size() != 1 || !(raw.get("note") instanceof String text)) throw badRequest();
        return text;
    }
    private static ResponseStatusException badRequest() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, AgentErrors.AGENT_INPUT_INVALID.code());
    }
}
