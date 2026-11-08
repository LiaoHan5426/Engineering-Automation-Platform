package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class McpProductionAllowlistTest {
    @Test void packageSubstringCannotImpersonateApprovedServer() {
        String pinned = "@modelcontextprotocol/server-memory@2025.11.25";
        assertFalse(McpProductionAllowlist.productionGranted("untrusted " + pinned, "read_graph"));
        assertFalse(McpProductionAllowlist.productionGranted("npx -y evil-" + pinned, "read_graph"));
        assertFalse(McpProductionAllowlist.productionGranted("npx -y " + pinned + " --extra", "read_graph"));
        assertTrue(McpProductionAllowlist.productionGranted("npx -y " + pinned, "read_graph"));
    }

    @Test
    void acceptsStreamableHttpTransport() {
        assertTrue(McpProductionAllowlist.isAllowedTransport("streamable-http"));
        assertTrue(McpProductionAllowlist.isRemoteTransport("streamable_http"));
        assertFalse(McpProductionAllowlist.isAllowedTransport("carrier-pigeon"));
    }

    @Test
    void marksOfficialReadonlyEndpointAsProductionGrantedForMatrixTools() {
        var endpoint = OfficialReadonlyMcpLock.endpoint();
        assertTrue(McpProductionAllowlist.matchesOfficialReadonly(endpoint));
        assertTrue(McpProductionAllowlist.productionGranted(endpoint, "echo"));
        assertFalse(McpProductionAllowlist.productionGranted(endpoint, "search"));
        assertEquals(List.of("echo"),
                McpProductionAllowlist.productionGrantedTools(endpoint, List.of("echo", "search")));
    }

    @Test
    void trustingOfficialPackageRejectsToolsOutsideAllowlist() {
        var endpoint = OfficialReadonlyMcpLock.endpoint();
        assertDoesNotThrow(() ->
                McpProductionAllowlist.requireTrustedGrant("stdio", endpoint, List.of("echo"), true));
        var error = assertThrows(IllegalArgumentException.class, () ->
                McpProductionAllowlist.requireTrustedGrant("stdio", endpoint, List.of("echo", "search"), true));
        assertTrue(error.getMessage().contains("MCP_PRODUCTION_TOOL_NOT_ALLOWED"));
    }

    @Test
    void nonOfficialTrustRemainsOperatorDeclared() {
        assertDoesNotThrow(() ->
                McpProductionAllowlist.requireTrustedGrant(
                        "stdio", "npx -y mcp-files", List.of("search", "read"), true));
        assertEquals(List.of(),
                McpProductionAllowlist.productionGrantedTools("npx -y mcp-files", List.of("search")));
    }
}
