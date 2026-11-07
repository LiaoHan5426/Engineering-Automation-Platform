package com.lh.eap.runtime.mcp.client;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * MCP Streamable-HTTP client: POST JSON-RPC with {@code Accept: application/json, text/event-stream},
 * accept either a JSON object or an SSE stream for the response, and echo {@code MCP-Session-Id}.
 * Does not implement GET long-poll / Last-Event-ID resumability in this slice.
 */
public final class StreamableHttpMcpTransport implements McpTransport {
    private final URI endpoint;
    private final HttpClient http;
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private volatile String sessionId;

    StreamableHttpMcpTransport(URI endpoint, HttpClient http) {
        this.endpoint = Objects.requireNonNull(endpoint, "endpoint");
        this.http = Objects.requireNonNull(http, "http");
    }

    public static StreamableHttpMcpTransport connect(String endpoint) {
        var uri = HttpMcpEndpoint.parse(endpoint);
        var client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        return new StreamableHttpMcpTransport(uri, client);
    }

    public URI endpoint() {
        return endpoint;
    }

    public String sessionId() {
        return sessionId;
    }

    @Override
    public String exchange(String requestJson, Duration timeout) throws IOException {
        if (closed.get()) throw new IOException("传输已关闭");
        Objects.requireNonNull(requestJson, "requestJson");
        var deadline = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofSeconds(5)
                : timeout;
        Object id = McpJsonRpc.idOf(requestJson);
        var builder = HttpRequest.newBuilder(endpoint)
                .timeout(deadline)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Accept", "application/json, text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson, StandardCharsets.UTF_8));
        var existingSession = sessionId;
        if (existingSession != null && !existingSession.isBlank()) {
            builder.header("MCP-Session-Id", existingSession);
        }
        try {
            var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            captureSession(response);
            int status = response.statusCode();
            if (status == 202 || status == 204) return "";
            if (status < 200 || status >= 300) {
                throw new IOException("MCP_STREAMABLE_HTTP_" + status);
            }
            var body = response.body() == null ? "" : response.body();
            var contentType = response.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT);
            if (contentType.contains("text/event-stream")) {
                return readSseResponse(body, id);
            }
            return body;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException("MCP_STREAMABLE_HTTP_INTERRUPTED", interrupted);
        }
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) return;
        var id = sessionId;
        if (id == null || id.isBlank()) return;
        try {
            var request = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofSeconds(3))
                    .header("MCP-Session-Id", id)
                    .DELETE()
                    .build();
            http.send(request, HttpResponse.BodyHandlers.discarding());
        } catch (Exception ignored) {
            // best-effort session teardown; 405 is allowed by the spec
        }
    }

    private void captureSession(HttpResponse<?> response) {
        response.headers().firstValue("MCP-Session-Id").ifPresent(value -> {
            if (value != null && !value.isBlank()) {
                sessionId = value.trim();
            }
        });
    }

    static String readSseResponse(String body, Object expectedId) throws IOException {
        if (body == null || body.isBlank()) {
            throw new IOException("MCP_STREAMABLE_HTTP_SSE_EMPTY");
        }
        try (var reader = new BufferedReader(new StringReader(body))) {
            String event = "message";
            var data = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    var payload = data.toString();
                    data.setLength(0);
                    var type = event;
                    event = "message";
                    if (payload.isBlank()) continue;
                    if ("message".equals(type) || type.isBlank()) {
                        if (expectedId == null) return payload;
                        Object id = McpJsonRpc.idOf(payload);
                        if (id != null && String.valueOf(expectedId).equals(String.valueOf(id))) {
                            return payload;
                        }
                    }
                    continue;
                }
                if (line.startsWith("event:")) {
                    event = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    if (data.length() > 0) data.append('\n');
                    data.append(line.substring(5).trim());
                }
            }
        }
        throw new IOException("MCP_STREAMABLE_HTTP_SSE_NO_RESPONSE");
    }
}
