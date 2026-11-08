package com.lh.eap.runtime.mcp.client;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Objects;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Legacy MCP SSE client: GET {@code text/event-stream} for {@code endpoint}/{@code message} events,
 * POST JSON-RPC to the advertised message URL. Not Streamable-HTTP.
 */
public final class SseMcpTransport implements McpTransport {
    private final URI messageEndpoint;
    private final HttpClient http;
    private final InputStream sseStream;
    private final ConcurrentHashMap<String, CompletableFuture<String>> pending;
    private final AtomicBoolean closed;
    private final Thread reader;

    private SseMcpTransport(
            URI messageEndpoint,
            HttpClient http,
            InputStream sseStream,
            ConcurrentHashMap<String, CompletableFuture<String>> pending,
            AtomicBoolean closed,
            Thread reader) {
        this.messageEndpoint = messageEndpoint;
        this.http = http;
        this.sseStream = sseStream;
        this.pending = pending;
        this.closed = closed;
        this.reader = reader;
    }

    public static SseMcpTransport connect(String sseUrl) throws IOException {
        return connect(sseUrl, Duration.ofSeconds(10));
    }

    public static SseMcpTransport connect(String sseUrl, Duration endpointWait) throws IOException {
        var sseEndpoint = HttpMcpEndpoint.parse(sseUrl);
        var http = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        var request = HttpRequest.newBuilder(sseEndpoint)
                .header("Accept", "text/event-stream")
                .GET()
                .build();
        HttpResponse<InputStream> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException("MCP_SSE_INTERRUPTED", interrupted);
        }
        if (response.statusCode() < 200 || response.statusCode() >= 300) {
            throw new IOException("MCP_SSE_" + response.statusCode());
        }
        var ready = new CompletableFuture<URI>();
        var pending = new ConcurrentHashMap<String, CompletableFuture<String>>();
        var closed = new AtomicBoolean(false);
        var stream = response.body();
        var reader = new Thread(() -> readLoop(stream, sseEndpoint, ready, pending, closed), "eap-mcp-sse-reader");
        reader.setDaemon(true);
        reader.start();
        try {
            var wait = endpointWait == null || endpointWait.isZero() || endpointWait.isNegative()
                    ? Duration.ofSeconds(10)
                    : endpointWait;
            var messageEndpoint = ready.get(wait.toMillis(), TimeUnit.MILLISECONDS);
            return new SseMcpTransport(messageEndpoint, http, stream, pending, closed, reader);
        } catch (TimeoutException timeout) {
            closed.set(true);
            stream.close();
            throw new IOException("MCP_SSE_ENDPOINT_TIMEOUT", timeout);
        } catch (Exception failure) {
            closed.set(true);
            stream.close();
            throw new IOException("MCP_SSE_ENDPOINT_FAILED", failure);
        }
    }

    public URI messageEndpoint() {
        return messageEndpoint;
    }

    @Override
    public String exchange(String requestJson, Duration timeout) throws IOException {
        if (closed.get()) throw new IOException("传输已关闭");
        Objects.requireNonNull(requestJson, "requestJson");
        var deadline = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofSeconds(5)
                : timeout;
        Object id = McpJsonRpc.idOf(requestJson);
        CompletableFuture<String> waiter = null;
        if (id != null) {
            waiter = new CompletableFuture<>();
            pending.put(String.valueOf(id), waiter);
        }
        try {
            post(requestJson, deadline, id);
            if (waiter == null) return "";
            return waiter.get(deadline.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException timeoutFailure) {
            throw new IOException("MCP_SSE_TIMEOUT", timeoutFailure);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException("MCP_SSE_INTERRUPTED", interrupted);
        } catch (Exception failure) {
            throw new IOException(failure.getMessage() == null ? "MCP_SSE_FAILED" : failure.getMessage(), failure);
        } finally {
            if (id != null) pending.remove(String.valueOf(id));
        }
    }

    private void post(String requestJson, Duration timeout, Object id) throws IOException, InterruptedException {
        var request = HttpRequest.newBuilder(messageEndpoint)
                .timeout(timeout)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Accept", "application/json, text/event-stream")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson, StandardCharsets.UTF_8))
                .build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        int status = response.statusCode();
        if (status == 202 || status == 204) return;
        if (status < 200 || status >= 300) throw new IOException("MCP_SSE_POST_" + status);
        var body = response.body();
        if (id != null && body != null && !body.isBlank() && body.contains("\"jsonrpc\"")) {
            var waiter = pending.get(String.valueOf(id));
            if (waiter != null) waiter.complete(body);
        }
    }

    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) return;
        for (var waiter : pending.values()) {
            waiter.completeExceptionally(new IOException("传输已关闭"));
        }
        pending.clear();
        try {
            sseStream.close();
        } catch (IOException ignored) {
            // best-effort
        }
        reader.interrupt();
    }

    private static void readLoop(
            InputStream stream,
            URI sseBase,
            CompletableFuture<URI> ready,
            ConcurrentHashMap<String, CompletableFuture<String>> pending,
            AtomicBoolean closed) {
        try (var reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String event = "message";
            var data = new StringBuilder();
            String line;
            while (!closed.get() && (line = reader.readLine()) != null) {
                if (line.isEmpty()) {
                    var payload = data.toString();
                    data.setLength(0);
                    var type = event;
                    event = "message";
                    if (payload.isBlank()) continue;
                    if ("endpoint".equals(type)) {
                        var resolved = sseBase.resolve(payload.trim());
                        HttpMcpEndpoint.parse(resolved.toString());
                        ready.complete(resolved);
                    } else if ("message".equals(type)) {
                        Object id = McpJsonRpc.idOf(payload);
                        if (id != null) {
                            var waiter = pending.get(String.valueOf(id));
                            if (waiter != null) waiter.complete(payload);
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
        } catch (Exception failure) {
            ready.completeExceptionally(failure);
        } finally {
            closed.set(true);
            for (var waiter : pending.values()) {
                waiter.completeExceptionally(new IOException("MCP_SSE_CLOSED"));
            }
        }
    }
}
