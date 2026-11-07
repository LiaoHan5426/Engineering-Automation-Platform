package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class StreamableHttpMcpTransportTest {
    private HttpServer http;
    private InMemoryMcpServer mcp;
    private String endpoint;
    private final AtomicReference<String> lastSessionHeader = new AtomicReference<>();
    private final AtomicInteger deletes = new AtomicInteger();
    private boolean sseMode;

    @BeforeEach
    void startLocalStreamableMcp() throws Exception {
        mcp = new InMemoryMcpServer(List.of("readonly.ping"));
        lastSessionHeader.set(null);
        deletes.set(0);
        sseMode = false;
        http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        http.createContext("/mcp", exchange -> {
            if ("DELETE".equalsIgnoreCase(exchange.getRequestMethod())) {
                deletes.incrementAndGet();
                exchange.getResponseHeaders().add("Allow", "POST");
                exchange.sendResponseHeaders(405, -1);
                exchange.close();
                return;
            }
            var sessionHeader = exchange.getRequestHeaders().getFirst("MCP-Session-Id");
            lastSessionHeader.set(sessionHeader);
            var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            boolean initialize = body.contains("\"method\":\"initialize\"");
            if (!initialize && (sessionHeader == null || sessionHeader.isBlank())) {
                var err = "{\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32000,\"message\":\"session required\"},\"id\":null}"
                        .getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(400, err.length);
                exchange.getResponseBody().write(err);
                exchange.close();
                return;
            }
            var reply = mcp.handle(body);
            if (reply == null || reply.isBlank()) {
                exchange.sendResponseHeaders(202, -1);
                exchange.close();
                return;
            }
            exchange.getResponseHeaders().add("MCP-Session-Id", "sess-streamable-1");
            if (sseMode) {
                var sse = "event: message\ndata: " + reply + "\n\n";
                var bytes = sse.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
            } else {
                var bytes = reply.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
            }
            exchange.close();
        });
        http.setExecutor(Executors.newCachedThreadPool());
        http.start();
        endpoint = "http://127.0.0.1:" + http.getAddress().getPort() + "/mcp";
    }

    @AfterEach
    void stopLocalStreamableMcp() {
        if (http != null) http.stop(0);
    }

    @Test
    void initializeListAndCallOverJsonResponse() throws Exception {
        try (var transport = StreamableHttpMcpTransport.connect(endpoint)) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(5));
            var init = client.initialize();
            assertEquals(McpProtocolClient.PROTOCOL_VERSION, init.get("protocolVersion"));
            assertEquals("sess-streamable-1", transport.sessionId());
            var tools = client.listTools();
            assertEquals(1, tools.size());
            assertEquals("readonly.ping", tools.getFirst().get("name"));
            assertEquals("sess-streamable-1", lastSessionHeader.get());
            var result = client.callTool("readonly.ping", Map.of());
            assertEquals(false, result.get("isError"));
            client.close();
        }
        assertEquals(1, deletes.get());
    }

    @Test
    void initializeListAndCallOverSseResponse() throws Exception {
        sseMode = true;
        try (var transport = StreamableHttpMcpTransport.connect(endpoint)) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(5));
            var init = client.initialize();
            assertEquals(McpProtocolClient.PROTOCOL_VERSION, init.get("protocolVersion"));
            var tools = client.listTools();
            assertEquals("readonly.ping", tools.getFirst().get("name"));
            var result = client.callTool("readonly.ping", Map.of());
            assertEquals(false, result.get("isError"));
            client.close();
        }
    }

    @Test
    void readSseResponseMatchesJsonRpcId() throws Exception {
        var payload = StreamableHttpMcpTransport.readSseResponse(
                "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":7,\"result\":{\"ok\":true}}\n\n",
                7);
        assertTrue(payload.contains("\"id\":7"));
        assertEquals(
                "MCP_STREAMABLE_HTTP_SSE_NO_RESPONSE",
                assertThrows(IOException.class,
                        () -> StreamableHttpMcpTransport.readSseResponse(
                                "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":1,\"result\":{}}\n\n",
                                9))
                        .getMessage());
    }
}
