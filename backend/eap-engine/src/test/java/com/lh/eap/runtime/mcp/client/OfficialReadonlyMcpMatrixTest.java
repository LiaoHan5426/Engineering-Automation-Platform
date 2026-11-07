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
        assertEquals(1, OfficialReadonlyMcpMatrix.views().size());
        assertEquals("echo", OfficialReadonlyMcpMatrix.views().getFirst().get("preferredTool"));
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
