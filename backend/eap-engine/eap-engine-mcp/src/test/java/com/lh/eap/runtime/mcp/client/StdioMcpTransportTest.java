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

    private List<String> command(String mode) {
        return List.of(ProcessHandle.current().info().command().orElseThrow(), "-cp", System.getProperty("java.class.path"), FakeStdioMcpServerMain.class.getName(), mode);
    }
    @Test void environmentDropsAmbientCredentialsAndRuntimeInjection() {
        var env = StdioMcpTransport.environment(Map.of("PATH","safe", "EAP_SENTINEL_SECRET","secret", "NODE_OPTIONS","inject", "JAVA_TOOL_OPTIONS","inject"), Map.of("EXPLICIT","granted"));
        assertEquals(Map.of("PATH","safe","EXPLICIT","granted"),env);
    }
    @Test void partialLineDeadlineAndOversizedFrameCloseTheProcess() throws Exception {
        for(String mode : List.of("partial","oversize")) {
            try(var transport = StdioMcpTransport.start(command(mode),Path.of(""))) {
                var failure = assertTimeoutPreemptively(Duration.ofSeconds(8), () ->
                    assertThrows(java.io.IOException.class, () -> transport.exchange("{\"id\":1}",Duration.ofSeconds(2))));
                assertEquals(mode.equals("partial") ? "MCP_TIMEOUT" : "MCP_FRAME_LIMIT",failure.getMessage());
                assertFalse(transport.alive());
            }
        }
    }
    @Test void stderrFloodDoesNotBlockProtocol() throws Exception {
        try(var transport = StdioMcpTransport.start(command("stderr"),Path.of(""))) {
            assertNotNull(new McpProtocolClient(transport,Duration.ofSeconds(5)).initialize());
        }
    }
    @Test void closingKillsDescendants() throws Exception {
        var transport = StdioMcpTransport.start(command("tree"),Path.of("")); long child;
        try { child = Long.parseLong(transport.exchange("{\"id\":1}",Duration.ofSeconds(5))); }
        finally { transport.close(); }
        assertFalse(ProcessHandle.of(child).map(ProcessHandle::isAlive).orElse(false));
    }
}
