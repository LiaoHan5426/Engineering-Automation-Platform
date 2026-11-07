package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
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
        assertEquals(4, OfficialReadonlyMcpMatrix.views().size());
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
    void thirdEntryPinsMemoryReadGraphOnly() {
        var entry = OfficialReadonlyMcpMatrix.ENTRIES.get(2);
        assertEquals("@modelcontextprotocol/server-memory", entry.packageName());
        assertEquals("2025.11.25", entry.version());
        assertEquals(List.of("read_graph"), entry.readonlyTools());
        assertEquals("read_graph", entry.preferredTool());
        assertTrue(OfficialReadonlyMcpMatrix.findByEndpoint(entry.endpoint()).isPresent());
        assertTrue(McpProductionAllowlist.productionGranted(entry.endpoint(), "read_graph"));
        assertFalse(McpProductionAllowlist.productionGranted(entry.endpoint(), "create_entities"));
    }

    @Test
    void fourthEntryPinsFilesystemListDirectoryOnly() {
        var entry = OfficialReadonlyMcpMatrix.ENTRIES.get(3);
        assertEquals("@modelcontextprotocol/server-filesystem", entry.packageName());
        assertEquals("2025.11.25", entry.version());
        assertEquals(List.of("list_directory"), entry.readonlyTools());
        assertEquals("list_directory", entry.preferredTool());
        assertTrue(OfficialReadonlyMcpMatrix.findByEndpoint(
                entry.endpoint() + " " + Path.of(".eap", "mcp-fs-readonly")).isPresent());
        assertTrue(McpProductionAllowlist.productionGranted(entry.endpoint(), "list_directory"));
        assertFalse(McpProductionAllowlist.productionGranted(entry.endpoint(), "write_file"));
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
