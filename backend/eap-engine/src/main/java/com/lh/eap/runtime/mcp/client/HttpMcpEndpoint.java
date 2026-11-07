package com.lh.eap.runtime.mcp.client;

import java.net.URI;
import java.util.Locale;
import java.util.Objects;

/**
 * Validates registry http endpoints for {@link HttpMcpTransport}. Rejects non-http(s) schemes and userinfo.
 */
public final class HttpMcpEndpoint {
    private HttpMcpEndpoint() {}

    public static URI parse(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) {
            throw new IllegalArgumentException("MCP_HTTP_ENDPOINT_REQUIRED");
        }
        var trimmed = endpoint.trim();
        if (trimmed.length() > 2000) throw new IllegalArgumentException("MCP_HTTP_ENDPOINT_TOO_LONG");
        final URI uri;
        try {
            uri = URI.create(trimmed);
        } catch (IllegalArgumentException invalid) {
            throw new IllegalArgumentException("MCP_HTTP_ENDPOINT_INVALID");
        }
        var scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!scheme.equals("http") && !scheme.equals("https")) {
            throw new IllegalArgumentException("MCP_HTTP_SCHEME_REQUIRED");
        }
        if (uri.getHost() == null || uri.getHost().isBlank()) {
            throw new IllegalArgumentException("MCP_HTTP_HOST_REQUIRED");
        }
        if (uri.getUserInfo() != null && !uri.getUserInfo().isBlank()) {
            throw new IllegalArgumentException("MCP_HTTP_USERINFO_FORBIDDEN");
        }
        return Objects.requireNonNull(uri);
    }
}
