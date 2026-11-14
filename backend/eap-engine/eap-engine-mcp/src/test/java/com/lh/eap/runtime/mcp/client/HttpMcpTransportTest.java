package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class HttpMcpTransportTest {
    private HttpServer http;
    private InMemoryMcpServer mcp;
    private String endpoint;

    @BeforeEach
    void startLocalHttpMcp() throws Exception {
        mcp = new InMemoryMcpServer(List.of("readonly.ping"));
        http = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        http.createContext("/mcp", exchange -> {
            var body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            var reply = mcp.handle(body);
            if (reply == null || reply.isBlank()) {
                exchange.sendResponseHeaders(204, -1);
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
    void stopLocalHttpMcp() {
        if (http != null) http.stop(0);
    }

    @Test
    void rejectsUnsafeEndpoints() {
        assertEquals("MCP_HTTP_SCHEME_REQUIRED",
                assertThrows(IllegalArgumentException.class, () -> HttpMcpEndpoint.parse("stdio://x")).getMessage());
        assertEquals("MCP_HTTP_USERINFO_FORBIDDEN",
                assertThrows(IllegalArgumentException.class,
                        () -> HttpMcpEndpoint.parse("http://user:pass@127.0.0.1/mcp")).getMessage());
        assertEquals("MCP_HTTP_ENDPOINT_REQUIRED",
                assertThrows(IllegalArgumentException.class, () -> HttpMcpEndpoint.parse(" ")).getMessage());
    }

    @Test void rejectsOversizedFramesBeforeDecode() throws Exception {
        http.createContext("/large",exchange->{
            exchange.getRequestBody().readAllBytes();
            var bytes=new byte[HttpMcpTransport.MAX_FRAME_BYTES+1];
            exchange.sendResponseHeaders(200,bytes.length);
            try{exchange.getResponseBody().write(bytes);}finally{exchange.close();}
        });
        try(var transport=HttpMcpTransport.connect(endpoint.replace("/mcp","/large"))){
            var failure=assertThrows(java.io.IOException.class,()->transport.exchange("{}",Duration.ofSeconds(2)));
            assertEquals("MCP_FRAME_LIMIT",failure.getMessage());
            assertThrows(java.io.IOException.class,()->transport.exchange("x".repeat(HttpMcpTransport.MAX_FRAME_BYTES+1),Duration.ofSeconds(2)));
        }
    }
    @Test void cancelClosesAnInFlightHttpRequest() throws Exception {
        var started=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        http.createContext("/blocked",exchange->{
            started.countDown();
            try{release.await(3,java.util.concurrent.TimeUnit.SECONDS);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();}
            exchange.close();
        });
        try(var transport=HttpMcpTransport.connect(endpoint.replace("/mcp","/blocked"))){
            var result=new java.util.concurrent.CompletableFuture<Object>();
            Thread.ofVirtual().start(()->{try{result.complete(transport.exchange("{}",Duration.ofSeconds(5)));}catch(Throwable failed){result.completeExceptionally(failed);}});
            assertTrue(started.await(1,java.util.concurrent.TimeUnit.SECONDS));
            transport.close();
            assertThrows(java.util.concurrent.ExecutionException.class,()->result.get(1,java.util.concurrent.TimeUnit.SECONDS));
        }finally{release.countDown();}
    }
    @Test
    void initializeListAndCallOverHttpJsonRpc() throws Exception {
        try (var transport = HttpMcpTransport.connect(endpoint)) {
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
