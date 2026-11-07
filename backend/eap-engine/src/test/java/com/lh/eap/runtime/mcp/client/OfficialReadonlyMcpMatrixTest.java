package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class OfficialReadonlyMcpMatrixTest {
    @Test
    void primaryEntryPinsEverythingPackageWithEcho() {
        var primary = OfficialReadonlyMcpMatrix.primary();
        assertEquals("@modelcontextprotocol/server-everything", primary.packageName());
        assertEquals("2.2.1", primary.version());
        assertEquals("echo", primary.preferredTool());
        assertEquals(List.of("echo"), primary.readonlyTools());
        assertTrue(OfficialReadonlyMcpMatrix.findByEndpoint(primary.endpoint()).isPresent());
        assertEquals(2, OfficialReadonlyMcpMatrix.views().size());
        assertEquals("echo", OfficialReadonlyMcpMatrix.views().getFirst().get("preferredTool"));
    }

    @Test
    void secondEntryPinsSequentialThinkingReadonlyTool() {
        var entry = OfficialReadonlyMcpMatrix.ENTRIES.get(1);
        assertEquals("@modelcontextprotocol/server-sequential-thinking", entry.packageName());
        assertEquals("0.6.2", entry.version());
        assertEquals(List.of("sequentialthinking"), entry.readonlyTools());
        assertEquals("sequentialthinking", entry.preferredTool());
        assertTrue(OfficialReadonlyMcpMatrix.findByEndpoint(entry.endpoint()).isPresent());
        assertTrue(McpProductionAllowlist.productionGranted(entry.endpoint(), "sequentialthinking"));
        assertFalse(McpProductionAllowlist.productionGranted(entry.endpoint(), "echo"));
    }

    @Test
    void productionAllowlistGrantsOnlyMatrixTools() {
        var endpoint = OfficialReadonlyMcpMatrix.primary().endpoint();
        assertTrue(McpProductionAllowlist.productionGranted(endpoint, "echo"));
        assertFalse(McpProductionAllowlist.productionGranted(endpoint, "add"));
        assertDoesNotThrow(() ->
                McpProductionAllowlist.requireTrustedGrant("stdio", endpoint, List.of("echo"), true));
        assertTrue(assertThrows(IllegalArgumentException.class, () ->
                McpProductionAllowlist.requireTrustedGrant("stdio", endpoint, List.of("echo", "search"), true))
                .getMessage().contains("MCP_PRODUCTION_TOOL_NOT_ALLOWED"));
    }
}
