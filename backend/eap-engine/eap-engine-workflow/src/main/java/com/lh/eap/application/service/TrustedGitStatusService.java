package com.lh.eap.application.service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Legacy synchronous response adapter over the same durable manual invocation service. */
@Service
public class TrustedGitStatusService {
    private final ToolExecutionService executions;
    public TrustedGitStatusService(ToolExecutionService executions) { this.executions = executions; }
    public Map<String, Object> invoke() {
        var row = executions.start(UUID.randomUUID());
        while (row.active()) {
            try { Thread.sleep(50); }
            catch (InterruptedException stoppedWaiting) {
                Thread.currentThread().interrupt();
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "TRUSTED_TOOL_UNKNOWN");
            }
            row = executions.get(row.id());
        }
        var result = new LinkedHashMap<String, Object>();
        result.put("capability", row.capabilityId());
        result.put("executionId", row.id());
        result.put("success", "SUCCEEDED".equals(row.status()));
        result.put("message", "平台独立执行本地只读 Git 能力 · " + row.status());
        result.put("stdout", row.stdout()); result.put("stderr", row.stderr());
        if (row.exitCode() != null) result.put("exitCode", row.exitCode());
        result.put("status", row.status());
        return Map.copyOf(result);
    }
}
