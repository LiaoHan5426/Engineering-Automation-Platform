package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class SseMcpTransportTest {
    private HttpServer http;
    private InMemoryMcpServer mcp;
    private String sseUrl;
    private final AtomicBoolean hold = new AtomicBoolean(true);
    private final AtomicReference<OutputStream> sseOut = new AtomicReference<>();
    private final CountDownLatch endpointReady = new CountDownLatch(1);

    @BeforeEach
    void startLegacySseHost() throws Exception {
        mcp = new InMemoryMcpServer(List.of("readonly.ping"));
        http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        http.createContext("/sse", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "text/event-stream");
            exchange.sendResponseHeaders(200, 0);
            var out = exchange.getResponseBody();
            sseOut.set(out);
            out.write("event: endpoint\ndata: /messages\n\n".getBytes(StandardCharsets.UTF_8));
            out.flush();
            endpointReady.countDown();
            while (hold.get()) {
                try {
                    Thread.sleep(40);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            out.close();
        });
        http.createContext("/messages", exchange -> {
            var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            var reply = mcp.handle(body);
            exchange.sendResponseHeaders(202, -1);
            exchange.close();
            if (reply != null && !reply.isBlank()) {
                var out = sseOut.get();
                assertNotNull(out);
                synchronized (out) {
                    out.write(("event: message\ndata: " + reply + "\n\n").getBytes(StandardCharsets.UTF_8));
                    out.flush();
                }
            }
        });
        http.setExecutor(Executors.newCachedThreadPool());
        http.start();
        sseUrl = "http://127.0.0.1:" + http.getAddress().getPort() + "/sse";
    }

    @AfterEach
    void stopLegacySseHost() {
        hold.set(false);
        if (http != null) http.stop(0);
    }

    @Test
    void initializeListAndCallOverLegacySse() throws Exception {
        try (var transport = SseMcpTransport.connect(sseUrl, Duration.ofSeconds(5))) {
            assertTrue(endpointReady.await(5, TimeUnit.SECONDS));
            assertTrue(transport.messageEndpoint().toString().endsWith("/messages"));
            var client = new McpProtocolClient(transport, Duration.ofSeconds(5));
            var init = client.initialize();
            assertEquals(McpProtocolClient.PROTOCOL_VERSION, init.get("protocolVersion"));
            var tools = client.listTools();
            assertEquals(1, tools.size());
            assertEquals("readonly.ping", tools.getFirst().get("name"));
            var result = client.callTool("readonly.ping", Map.of());
            assertEquals(false, result.get("isError"));
            client.close();
        }
    }
}
