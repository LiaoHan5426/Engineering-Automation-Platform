package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * MCP-01 official read-oriented stdio package contrast.
 * Requires {@code EAP_RUN_MCP_OFFICIAL=true}, local Node/npx, and network for {@code npx -y}.
 */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_MCP_OFFICIAL", matches = "true")
class OfficialReadonlyMcpStdioTest {

    @Test
    void initializeListAndEchoAgainstLockedOfficialPackage() throws Exception {
        assertEquals(List.of("npx", "-y", OfficialReadonlyMcpLock.packageAtVersion()),
                StdioMcpCommand.parse(OfficialReadonlyMcpLock.endpoint()));

        var npx = resolveNpx();
        assumeTrue(npx != null, "npx executable required for official MCP stdio contrast");
        var command = new ArrayList<>(OfficialReadonlyMcpLock.argv(npx));
        try (var transport = StdioMcpTransport.start(command, Path.of("").toAbsolutePath())) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(90));
            var init = client.initialize();
            assertNotNull(init.get("protocolVersion"));
            var tools = client.listTools();
            assertFalse(tools.isEmpty(), "official package should advertise tools");
            assertTrue(tools.stream().anyMatch(tool -> OfficialReadonlyMcpLock.READONLY_TOOL.equals(tool.get("name"))),
                    () -> "missing " + OfficialReadonlyMcpLock.READONLY_TOOL + " in " + tools.stream()
                            .map(tool -> tool.get("name")).toList());
            var result = client.callTool(OfficialReadonlyMcpLock.READONLY_TOOL, Map.of("message", "eap-readonly"));
            assertNotEquals(Boolean.TRUE, result.get("isError"));
            assertEquals(4, OfficialReadonlyMcpMatrix.ENTRIES.size());
            assertEquals(OfficialReadonlyMcpMatrix.primary().preferredTool(), OfficialReadonlyMcpLock.READONLY_TOOL);
            client.close();
            assertFalse(transport.alive());
        }
    }

    @Test
    void initializeListAndCallSequentialThinkingMatrixEntry() throws Exception {
        var entry = OfficialReadonlyMcpMatrix.ENTRIES.get(1);
        assertEquals("@modelcontextprotocol/server-sequential-thinking", entry.packageName());
        var npx = resolveNpx();
        assumeTrue(npx != null, "npx executable required for official MCP stdio contrast");
        var command = new ArrayList<>(entry.argv(npx));
        try (var transport = StdioMcpTransport.start(command, Path.of("").toAbsolutePath())) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(90));
            client.initialize();
            var tools = client.listTools();
            assertTrue(tools.stream().anyMatch(tool -> entry.preferredTool().equals(tool.get("name"))),
                    () -> "missing " + entry.preferredTool() + " in " + tools.stream()
                            .map(tool -> tool.get("name")).toList());
            var result = client.callTool(entry.preferredTool(), Map.of(
                    "thought", "eap-matrix-probe",
                    "nextThoughtNeeded", false,
                    "thoughtNumber", 1,
                    "totalThoughts", 1));
            assertNotEquals(Boolean.TRUE, result.get("isError"));
            client.close();
            assertFalse(transport.alive());
        }
    }

    @Test
    void initializeListAndCallMemoryReadGraphMatrixEntry() throws Exception {
        var entry = OfficialReadonlyMcpMatrix.ENTRIES.get(2);
        assertEquals("@modelcontextprotocol/server-memory", entry.packageName());
        var npx = resolveNpx();
        assumeTrue(npx != null, "npx executable required for official MCP stdio contrast");
        var command = new ArrayList<>(entry.argv(npx));
        try (var transport = StdioMcpTransport.start(command, Path.of("").toAbsolutePath())) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(90));
            client.initialize();
            var tools = client.listTools();
            assertTrue(tools.stream().anyMatch(tool -> entry.preferredTool().equals(tool.get("name"))),
                    () -> "missing " + entry.preferredTool() + " in " + tools.stream()
                            .map(tool -> tool.get("name")).toList());
            var result = client.callTool(entry.preferredTool(), Map.of());
            assertNotEquals(Boolean.TRUE, result.get("isError"));
            client.close();
            assertFalse(transport.alive());
        }
    }

    @Test
    void initializeListAndCallFilesystemListDirectoryMatrixEntry() throws Exception {
        var entry = OfficialReadonlyMcpMatrix.ENTRIES.get(3);
        assertEquals("@modelcontextprotocol/server-filesystem", entry.packageName());
        var npx = resolveNpx();
        assumeTrue(npx != null, "npx executable required for official MCP stdio contrast");
        var allowRoot = Files.createTempDirectory("eap-mcp-fs-readonly");
        var command = new ArrayList<>(entry.argv(npx));
        command.add(allowRoot.toAbsolutePath().toString());
        try (var transport = StdioMcpTransport.start(command, Path.of("").toAbsolutePath())) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(90));
            client.initialize();
            var tools = client.listTools();
            for (var toolName : entry.readonlyTools()) {
                assertTrue(tools.stream().anyMatch(tool -> toolName.equals(tool.get("name"))),
                        () -> "missing " + toolName + " in " + tools.stream()
                                .map(tool -> tool.get("name")).toList());
            }
            // Call verified readonly tools; directory_tree stays list-only (upstream structuredContent bug).
            var listed = client.callTool("list_directory", Map.of("path", allowRoot.toString()));
            assertNotEquals(Boolean.TRUE, listed.get("isError"));
            var info = client.callTool("get_file_info", Map.of("path", allowRoot.toString()));
            assertNotEquals(Boolean.TRUE, info.get("isError"));
            client.close();
            assertFalse(transport.alive());
        }
    }

    private static String resolveNpx() {
        var path = System.getenv("PATH");
        if (path == null || path.isBlank()) return null;
        var windows = System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
        for (var dir : path.split(windows ? ";" : ":")) {
            if (dir.isBlank()) continue;
            var base = Path.of(dir);
            for (var name : windows ? List.of("npx.cmd", "npx.exe", "npx") : List.of("npx")) {
                var candidate = base.resolve(name);
                if (Files.isRegularFile(candidate)) return candidate.toAbsolutePath().toString();
            }
        }
        return null;
    }
}
