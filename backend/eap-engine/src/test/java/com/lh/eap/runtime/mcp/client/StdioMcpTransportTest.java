package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class StdioMcpTransportTest {

    @Test
    void rejectsShellAndUnsafeTokens() {
        assertEquals("MCP_STDIO_SHELL_FORBIDDEN",
                assertThrows(IllegalArgumentException.class, () -> StdioMcpCommand.parse("cmd /c echo hi")).getMessage());
        assertEquals("MCP_STDIO_COMMAND_UNSAFE",
                assertThrows(IllegalArgumentException.class, () -> StdioMcpCommand.parse("tool | other")).getMessage());
        assertEquals(List.of("npx", "-y", "mcp-files"), StdioMcpCommand.parse("npx -y mcp-files"));
    }

    @Test
    void subprocessInitializeListAndCallThenCleanup() throws Exception {
        var java = ProcessHandle.current().info().command().orElse("java");
        var command = new ArrayList<String>();
        command.add(java);
        command.add("-cp");
        command.add(System.getProperty("java.class.path"));
        command.add(FakeStdioMcpServerMain.class.getName());
        try (var transport = StdioMcpTransport.start(command, Path.of("").toAbsolutePath())) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(15));
            var init = client.initialize();
            assertEquals(McpProtocolClient.PROTOCOL_VERSION, init.get("protocolVersion"));
            var tools = client.listTools();
            assertEquals(1, tools.size());
            assertEquals("readonly.ping", tools.getFirst().get("name"));
            var result = client.callTool("readonly.ping", Map.of());
            assertEquals(false, result.get("isError"));
            assertTrue(transport.alive());
            client.close();
            assertFalse(transport.alive());
        }
    }

    @Test
    void timeoutSurfacesWithoutLeavingOrphanProcess() throws Exception {
        var java = ProcessHandle.current().info().command().orElse("java");
        var command = List.of(java, "-cp", System.getProperty("java.class.path"), FakeStdioMcpServerMain.class.getName());
        var transport = StdioMcpTransport.start(command, Path.of("").toAbsolutePath());
        try {
            // Send a request that expects a response but write garbage so the child never replies with id-matched JSON.
            // Instead force timeout by using an extremely short deadline against a sleeping child path:
            // Fake server answers quickly; so we close stdin side after a non-matching wait by using Duration.ZERO+.
            assertThrows(Exception.class, () -> transport.exchange("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}", Duration.ofNanos(1)));
        } finally {
            transport.close();
            assertFalse(transport.alive());
        }
    }
}
