package com.lh.eap.runtime.mcp.client;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Production grant matrix for MCP-01: allowed transports plus {@link OfficialReadonlyMcpMatrix}.
 * Operator trust of other endpoints remains allowed, but is not marked production-granted.
 */
public final class McpProductionAllowlist {
    public static final Set<String> TRANSPORTS = Set.of(
            "stdio", "http", "sse", "streamable-http", "streamable_http");

    private McpProductionAllowlist() {}

    public static String normalizeTransport(String transport) {
        if (transport == null || transport.isBlank()) return "stdio";
        return transport.trim().toLowerCase(Locale.ROOT);
    }

    public static boolean isAllowedTransport(String transport) {
        return TRANSPORTS.contains(normalizeTransport(transport));
    }

    public static boolean isRemoteTransport(String transport) {
        var channel = normalizeTransport(transport);
        return "http".equals(channel) || "sse".equals(channel)
                || "streamable-http".equals(channel) || "streamable_http".equals(channel);
    }

    public static boolean matchesOfficialReadonly(String endpoint) {
        return OfficialReadonlyMcpMatrix.findByEndpoint(endpoint).isPresent();
    }

    public static List<String> officialReadonlyTools() {
        var tools = new LinkedHashSet<String>();
        for (var entry : OfficialReadonlyMcpMatrix.ENTRIES) {
            tools.addAll(entry.readonlyTools());
        }
        return List.copyOf(tools);
    }

    public static boolean productionGranted(String endpoint, String tool) {
        if (tool == null || tool.isBlank()) return false;
        return OfficialReadonlyMcpMatrix.findByEndpoint(endpoint)
                .map(entry -> entry.readonlyTools().contains(tool.trim()))
                .orElse(false);
    }

    public static List<String> productionGrantedTools(String endpoint, List<String> tools) {
        if (tools == null || tools.isEmpty()) return List.of();
        return tools.stream().filter(tool -> productionGranted(endpoint, tool)).toList();
    }

    /**
     * Validates transport always; when trusting a matrix package, tools must be a subset of that
     * entry's readonly tools.
     */
    public static void requireTrustedGrant(String transport, String endpoint, List<String> tools, boolean trusted) {
        var channel = normalizeTransport(transport);
        if (!isAllowedTransport(channel)) {
            throw new IllegalArgumentException("传输方式只能是 stdio、http、sse 或 streamable-http");
        }
        if (!trusted) return;
        var matched = OfficialReadonlyMcpMatrix.findByEndpoint(endpoint);
        if (matched.isEmpty()) return;
        var entry = matched.get();
        var allowed = Set.copyOf(entry.readonlyTools());
        for (var tool : tools == null ? List.<String>of() : tools) {
            if (tool == null || tool.isBlank()) continue;
            if (!allowed.contains(tool.trim())) {
                throw new IllegalArgumentException(
                        "MCP_PRODUCTION_TOOL_NOT_ALLOWED：" + tool.trim()
                                + " 不在官方只读生产白名单 " + allowed
                                + "（" + entry.packageAtVersion() + "）");
            }
        }
        Objects.requireNonNull(endpoint);
    }
}
