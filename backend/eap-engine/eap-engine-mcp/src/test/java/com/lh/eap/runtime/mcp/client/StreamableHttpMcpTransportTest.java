package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
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
    private final AtomicReference<String> lastEventIdHeader = new AtomicReference<>();
    private final AtomicInteger deletes = new AtomicInteger();
    private final AtomicInteger getCount = new AtomicInteger();
    private boolean sseMode;
    private boolean resumeMode;
    private final ConcurrentHashMap<String, String> pendingByEvent = new ConcurrentHashMap<>();

    @BeforeEach
    void startLocalStreamableMcp() throws Exception {
        mcp = new InMemoryMcpServer(List.of("readonly.ping"));
        lastSessionHeader.set(null);
        lastEventIdHeader.set(null);
        deletes.set(0);
        getCount.set(0);
        sseMode = false;
        resumeMode = false;
        pendingByEvent.clear();
        http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        http.createContext("/mcp", exchange -> {
            var method = exchange.getRequestMethod();
            if ("DELETE".equalsIgnoreCase(method)) {
                deletes.incrementAndGet();
                exchange.getResponseHeaders().add("Allow", "POST");
                exchange.sendResponseHeaders(405, -1);
                exchange.close();
                return;
            }
            var sessionHeader = exchange.getRequestHeaders().getFirst("MCP-Session-Id");
            lastSessionHeader.set(sessionHeader);
            if ("GET".equalsIgnoreCase(method)) {
                getCount.incrementAndGet();
                var lastEvent = exchange.getRequestHeaders().getFirst("Last-Event-ID");
                lastEventIdHeader.set(lastEvent);
                if (lastEvent == null || lastEvent.isBlank() || !pendingByEvent.containsKey(lastEvent)) {
                    exchange.sendResponseHeaders(204, -1);
                    exchange.close();
                    return;
                }
                var reply = pendingByEvent.remove(lastEvent);
                var sse = "id: " + lastEvent + "-done\nevent: message\ndata: " + reply + "\n\n";
                var bytes = sse.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
                exchange.getResponseHeaders().add("MCP-Session-Id", "sess-streamable-1");
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
                return;
            }
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
            if (resumeMode) {
                var eventId = "evt-" + Math.abs(body.hashCode());
                pendingByEvent.put(eventId, reply);
                var sse = "id: " + eventId + "\nevent: message\ndata: \nretry: 1\n\n";
                var bytes = sse.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
                exchange.sendResponseHeaders(200, bytes.length);
                exchange.getResponseBody().write(bytes);
                exchange.close();
                return;
            }
            if (sseMode) {
                var sse = "id: sse-1\nevent: message\ndata: " + reply + "\n\n";
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
            assertEquals("sse-1", transport.lastEventId());
            var tools = client.listTools();
            assertEquals("readonly.ping", tools.getFirst().get("name"));
            var result = client.callTool("readonly.ping", Map.of());
            assertEquals(false, result.get("isError"));
            client.close();
        }
    }

    @Test
    void resumesDisconnectedSseStreamWithLastEventId() throws Exception {
        resumeMode = true;
        try (var transport = StreamableHttpMcpTransport.connect(endpoint)) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(5));
            var init = client.initialize();
            assertEquals(McpProtocolClient.PROTOCOL_VERSION, init.get("protocolVersion"));
            assertNotNull(transport.lastEventId());
            assertTrue(getCount.get() >= 1, "GET resume should run after primed SSE disconnect");
            assertNotNull(lastEventIdHeader.get(), "Last-Event-ID must be sent on GET resume");
            var tools = client.listTools();
            assertEquals(1, tools.size());
            var result = client.callTool("readonly.ping", Map.of());
            assertEquals(false, result.get("isError"));
            client.close();
        }
        assertTrue(getCount.get() >= 3, "initialize/list/call each resume once");
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

    @Test
    void parseSseCapturesEventIdAndRetry() throws Exception {
        var parsed = StreamableHttpMcpTransport.parseSse(
                "id: cursor-9\nretry: 25\nevent: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":3,\"result\":{}}\n\n",
                3);
        assertEquals("cursor-9", parsed.lastEventId());
        assertEquals(25, parsed.retryMs());
        assertTrue(parsed.payload().contains("\"id\":3"));
    }
}
