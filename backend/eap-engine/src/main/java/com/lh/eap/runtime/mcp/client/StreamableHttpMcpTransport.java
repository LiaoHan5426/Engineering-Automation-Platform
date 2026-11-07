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
 * MCP Streamable-HTTP client: POST JSON-RPC with dual Accept, JSON or SSE responses,
 * {@code MCP-Session-Id}, and GET resume via {@code Last-Event-ID} when an SSE stream disconnects
 * before the matching JSON-RPC response arrives.
 */
public final class StreamableHttpMcpTransport implements McpTransport {
    private final URI endpoint;
    private final HttpClient http;
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private volatile String sessionId;
    private volatile String lastEventId;
    private volatile long retryMs = 0;

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

    public String lastEventId() {
        return lastEventId;
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
        attachSession(builder);
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
                var parsed = parseSse(body, id);
                rememberCursor(parsed);
                if (parsed.payload() != null) return parsed.payload();
                if (id != null && lastEventId != null && !lastEventId.isBlank()) {
                    return resumeUntil(id, deadline);
                }
                throw new IOException("MCP_STREAMABLE_HTTP_SSE_NO_RESPONSE");
            }
            return body;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException("MCP_STREAMABLE_HTTP_INTERRUPTED", interrupted);
        }
    }

    /**
     * Resumes the server SSE stream with {@code Last-Event-ID}. Used after a POST SSE disconnect
     * before the JSON-RPC response, or by tests exercising the GET path directly.
     */
    public String resume(Duration timeout) throws IOException {
        if (closed.get()) throw new IOException("传输已关闭");
        if (lastEventId == null || lastEventId.isBlank()) {
            throw new IOException("MCP_STREAMABLE_HTTP_NO_LAST_EVENT_ID");
        }
        var deadline = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofSeconds(5)
                : timeout;
        return resumeUntil(null, deadline);
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

    private String resumeUntil(Object expectedId, Duration deadline) throws IOException {
        var remaining = deadline.toMillis();
        var attempts = 0;
        while (remaining > 0 && attempts < 8) {
            attempts++;
            var wait = retryMs > 0 ? Math.min(retryMs, remaining) : 0;
            if (wait > 0) {
                try {
                    Thread.sleep(wait);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IOException("MCP_STREAMABLE_HTTP_INTERRUPTED", interrupted);
                }
                remaining -= wait;
            }
            var started = System.currentTimeMillis();
            var builder = HttpRequest.newBuilder(endpoint)
                    .timeout(Duration.ofMillis(Math.max(1, remaining)))
                    .header("Accept", "application/json, text/event-stream")
                    .header("Last-Event-ID", lastEventId)
                    .GET();
            attachSession(builder);
            try {
                var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                captureSession(response);
                int status = response.statusCode();
                if (status == 405) {
                    throw new IOException("MCP_STREAMABLE_HTTP_GET_UNSUPPORTED");
                }
                if (status < 200 || status >= 300) {
                    throw new IOException("MCP_STREAMABLE_HTTP_GET_" + status);
                }
                var body = response.body() == null ? "" : response.body();
                var parsed = parseSse(body, expectedId);
                rememberCursor(parsed);
                if (parsed.payload() != null) return parsed.payload();
                if (expectedId == null && !body.isBlank()) return body;
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IOException("MCP_STREAMABLE_HTTP_INTERRUPTED", interrupted);
            }
            remaining -= Math.max(1, System.currentTimeMillis() - started);
            if (lastEventId == null || lastEventId.isBlank()) break;
        }
        throw new IOException("MCP_STREAMABLE_HTTP_RESUME_TIMEOUT");
    }

    private void attachSession(HttpRequest.Builder builder) {
        var existingSession = sessionId;
        if (existingSession != null && !existingSession.isBlank()) {
            builder.header("MCP-Session-Id", existingSession);
        }
    }

    private void captureSession(HttpResponse<?> response) {
        response.headers().firstValue("MCP-Session-Id").ifPresent(value -> {
            if (value != null && !value.isBlank()) {
                sessionId = value.trim();
            }
        });
    }

    private void rememberCursor(SseParseResult parsed) {
        if (parsed.lastEventId() != null && !parsed.lastEventId().isBlank()) {
            lastEventId = parsed.lastEventId();
        }
        if (parsed.retryMs() >= 0) {
            retryMs = parsed.retryMs();
        }
    }

    /** Compatible helper used by older tests: returns payload or throws. */
    static String readSseResponse(String body, Object expectedId) throws IOException {
        var parsed = parseSse(body, expectedId);
        if (parsed.payload() != null) return parsed.payload();
        throw new IOException("MCP_STREAMABLE_HTTP_SSE_NO_RESPONSE");
    }

    static SseParseResult parseSse(String body, Object expectedId) throws IOException {
        if (body == null || body.isBlank()) {
            throw new IOException("MCP_STREAMABLE_HTTP_SSE_EMPTY");
        }
        String lastId = null;
        long retry = -1;
        String matched = null;
        try (var reader = new BufferedReader(new StringReader(body))) {
            String event = "message";
            String eventId = null;
            var data = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    var payload = data.toString();
                    data.setLength(0);
                    var type = event;
                    var id = eventId;
                    event = "message";
                    eventId = null;
                    if (id != null && !id.isBlank()) lastId = id;
                    if (payload.isBlank()) continue;
                    if ("message".equals(type) || type.isBlank()) {
                        if (expectedId == null) {
                            matched = payload;
                        } else {
                            Object jsonId = McpJsonRpc.idOf(payload);
                            if (jsonId != null && String.valueOf(expectedId).equals(String.valueOf(jsonId))) {
                                matched = payload;
                            }
                        }
                    }
                    continue;
                }
                if (line.startsWith("event:")) {
                    event = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    if (data.length() > 0) data.append('\n');
                    data.append(line.substring(5).trim());
                } else if (line.startsWith("id:")) {
                    eventId = line.substring(3).trim();
                } else if (line.startsWith("retry:")) {
                    try {
                        retry = Long.parseLong(line.substring(6).trim());
                    } catch (NumberFormatException ignored) {
                        // keep previous retry
                    }
                }
            }
        }
        return new SseParseResult(matched, lastId, retry);
    }

    record SseParseResult(String payload, String lastEventId, long retryMs) {}
}
