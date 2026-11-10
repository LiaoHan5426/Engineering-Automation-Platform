package com.lh.eap.runtime.mcp.client;
import com.lh.eap.error.McpErrors;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Objects;

/**
 * MCP JSON-RPC over a single HTTP POST endpoint (request/response).
 * Legacy SSE uses {@link SseMcpTransport}; Streamable-HTTP uses {@link StreamableHttpMcpTransport}.
 */
public final class HttpMcpTransport implements McpTransport {
    private final URI endpoint;
    private final HttpClient http;
    private volatile boolean closed;

    HttpMcpTransport(URI endpoint, HttpClient http) {
        this.endpoint = Objects.requireNonNull(endpoint, "endpoint");
        this.http = Objects.requireNonNull(http, "http");
    }

    public static HttpMcpTransport connect(String endpoint) {
        var uri = HttpMcpEndpoint.parse(endpoint);
        var client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
        return new HttpMcpTransport(uri, client);
    }

    public URI endpoint() {
        return endpoint;
    }

    @Override
    public String exchange(String requestJson, Duration timeout) throws IOException {
        if (closed) throw new IOException("传输已关闭");
        Objects.requireNonNull(requestJson, "requestJson");
        var deadline = timeout == null || timeout.isNegative() || timeout.isZero()
                ? Duration.ofSeconds(5)
                : timeout;
        var request = HttpRequest.newBuilder(endpoint)
                .timeout(deadline)
                .header("Content-Type", "application/json; charset=utf-8")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestJson, StandardCharsets.UTF_8))
                .build();
        try {
            var response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            int status = response.statusCode();
            if (status == 204 || status == 202) return "";
            if (status < 200 || status >= 300) {
                throw new IOException("MCP_HTTP_" + status);
            }
            var body = response.body();
            return body == null ? "" : body;
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IOException(McpErrors.MCP_HTTP_INTERRUPTED.code(), interrupted);
        }
    }

    @Override
    public void close() {
        closed = true;
    }
}
