package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class McpProtocolClientTest {
    @Test
    void runsInitializeListAndCall() {
        var server = new InMemoryMcpServer(List.of("readonly.ping"));
        try (var transport = InMemoryMcpTransport.loopback(server)) {
            var client = new McpProtocolClient(transport);
            var init = client.initialize();
            assertEquals(McpProtocolClient.PROTOCOL_VERSION, init.get("protocolVersion"));
            var tools = client.listTools();
            assertEquals(1, tools.size());
            var result = client.callTool("readonly.ping", Map.of());
            assertNotNull(result.get("content"));
        }
    }
}
