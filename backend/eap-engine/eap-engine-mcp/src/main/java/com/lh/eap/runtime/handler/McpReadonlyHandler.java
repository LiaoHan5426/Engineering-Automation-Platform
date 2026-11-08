package com.lh.eap.runtime.handler;

import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.runtime.mcp.client.*;
import java.util.*;
import org.springframework.stereotype.Component;

/** First production bridge: fixed no-argument memory read, with persisted expert grants. */
@Component
public final class McpReadonlyHandler implements CapabilityHandler {
    @Override public boolean dynamicCapabilities() { return true; }
    private final McpServerRegistry servers;
    private final McpClientService client;
    public McpReadonlyHandler(McpServerRegistry servers, McpClientService client) { this.servers=servers; this.client=client; }
    @Override public CapabilityKind kind() { return CapabilityKind.MCP; }
    @Override public Set<String> capabilities() {
        var result = new TreeSet<String>();
        for (var server : servers.usableServers()) {
            if (server.tools().contains("read_graph") && McpProductionAllowlist.productionGranted(server.endpoint(), "read_graph"))
                result.add(McpServerRegistry.capabilityId(server.id(), "read_graph"));
        }
        return Set.copyOf(result);
    }
    @Override public NodeResult handle(CapabilityContext context) {
        String capability = context.step().capability();
        if (!capabilities().contains(capability) || !servers.grants(context.expertId()).contains(capability))
            throw new SecurityException("MCP_TOOL_NOT_AUTHORIZED");
        var result = client.callReadOnly(context.executionId(), context.expertId(), capability, Map.of());
        boolean success = !Boolean.TRUE.equals(result.get("isError"));
        // Untrusted source data remains structured evidence, never instructions or tool authority.
        return new NodeResult(success, false, success ? "MCP_TOOL_SUCCEEDED" : "MCP_TOOL_FAILED", result);
    }
}
