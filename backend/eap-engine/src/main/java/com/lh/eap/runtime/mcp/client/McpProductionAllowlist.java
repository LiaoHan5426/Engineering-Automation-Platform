package com.lh.eap.runtime.mcp.client;

import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Production grant matrix for MCP-01: allowed transports plus the locked official read-only stdio package.
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
        if (endpoint == null || endpoint.isBlank()) return false;
        var trimmed = endpoint.trim();
        if (trimmed.equals(OfficialReadonlyMcpLock.endpoint())) return true;
        return trimmed.contains(OfficialReadonlyMcpLock.packageAtVersion());
    }

    public static List<String> officialReadonlyTools() {
        return List.of(OfficialReadonlyMcpLock.READONLY_TOOL);
    }

    public static boolean productionGranted(String endpoint, String tool) {
        if (tool == null || tool.isBlank()) return false;
        return matchesOfficialReadonly(endpoint) && officialReadonlyTools().contains(tool.trim());
    }

    public static List<String> productionGrantedTools(String endpoint, List<String> tools) {
        if (tools == null || tools.isEmpty() || !matchesOfficialReadonly(endpoint)) return List.of();
        return tools.stream().filter(tool -> productionGranted(endpoint, tool)).toList();
    }

    /**
     * Validates transport always; when trusting the locked official package, tools must be a subset of
     * the production tool list.
     */
    public static void requireTrustedGrant(String transport, String endpoint, List<String> tools, boolean trusted) {
        var channel = normalizeTransport(transport);
        if (!isAllowedTransport(channel)) {
            throw new IllegalArgumentException("传输方式只能是 stdio、http、sse 或 streamable-http");
        }
        if (!trusted) return;
        if (!matchesOfficialReadonly(endpoint)) return;
        var allowed = Set.copyOf(officialReadonlyTools());
        for (var tool : tools == null ? List.<String>of() : tools) {
            if (tool == null || tool.isBlank()) continue;
            if (!allowed.contains(tool.trim())) {
                throw new IllegalArgumentException(
                        "MCP_PRODUCTION_TOOL_NOT_ALLOWED：" + tool.trim()
                                + " 不在官方只读生产白名单 " + allowed
                                + "（" + OfficialReadonlyMcpLock.packageAtVersion() + "）");
            }
        }
        Objects.requireNonNull(endpoint);
    }
}
