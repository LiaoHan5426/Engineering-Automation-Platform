package com.lh.eap.web.controller;
import com.lh.eap.application.service.ExpertAgentApprovalService;
import org.springframework.beans.factory.annotation.Autowired;

import com.lh.eap.ai.SqlExpertAgentService;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.bind.annotation.*;

/** Synchronous bounded runs; caller supplies a UUID so another request can cancel the in-flight run. */
@RestController
@RequestMapping("/api/experts/{expertId}/agent-runs/{executionId}")
public class SqlExpertAgentController {
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
}
