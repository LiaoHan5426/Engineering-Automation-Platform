package com.lh.eap.runtime.mcp.client;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Offline-capable MCP client: initialize → tools/list → tools/call over a {@link McpTransport}.
 */
public final class McpProtocolClient {
    public static final String PROTOCOL_VERSION = "2024-11-05";
    public static final int MAX_TOOL_LIST_PAGES = 32;

    private final McpTransport transport;
    private final Duration timeout;
    private boolean initialized;

    public McpProtocolClient(McpTransport transport) {
        this(transport, Duration.ofSeconds(5));
    }

    public McpProtocolClient(McpTransport transport, Duration timeout) {
        this.transport = transport;
        this.timeout = timeout;
    }

    public Map<String, Object> initialize() {
        var params = new LinkedHashMap<String, Object>();
        params.put("protocolVersion", PROTOCOL_VERSION);
        params.put("capabilities", Map.of());
        params.put("clientInfo", Map.of("name", "eap", "version", "1.6"));
        var result = call("initialize", params);
        try {
            transport.exchange(McpJsonRpc.notification("notifications/initialized", Map.of()), timeout);
        } catch (IOException failure) {
            throw new McpProtocolException(failure.getMessage() == null ? "MCP_IO" : failure.getMessage(), -1, failure);
        }
        initialized = true;
        return result;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> listTools() {
        requireReady();
        var all = new ArrayList<Map<String, Object>>();
        String cursor = null;
        for (int page = 0; page < MAX_TOOL_LIST_PAGES; page++) {
            var params = new LinkedHashMap<String, Object>();
            if (cursor != null) params.put("cursor", cursor);
            var result = call("tools/list", params);
            if (result.get("tools") instanceof List<?> tools) {
                for (var item : tools) {
                    if (item instanceof Map<?, ?> row) {
                        var typed = new LinkedHashMap<String, Object>();
                        for (var entry : row.entrySet()) {
                            if (entry.getKey() instanceof String key) typed.put(key, entry.getValue());
                        }
                        all.add(Map.copyOf(typed));
                    }
                }
            }
            if (result.get("nextCursor") instanceof String next && !next.isBlank()) {
                cursor = next;
            } else {
                return List.copyOf(all);
            }
        }
        throw new McpProtocolException("MCP_TOOL_LIST_PAGE_LIMIT", -1);
    }

    public Map<String, Object> callTool(String name, Map<String, Object> arguments) {
        requireReady();
        var params = new LinkedHashMap<String, Object>();
        params.put("name", name);
        params.put("arguments", arguments == null ? Map.of() : arguments);
        return call("tools/call", params);
    }

    public void close() {
        initialized = false;
        transport.close();
    }

    private Map<String, Object> call(String method, Map<String, Object> params) {
        try {
            var response = transport.exchange(McpJsonRpc.request(method, params), timeout);
            return McpJsonRpc.parseResponse(response);
        } catch (IOException failure) {
            throw new McpProtocolException(failure.getMessage() == null ? "MCP_IO" : failure.getMessage(), -1, failure);
        }
    }

    private void requireReady() {
        if (!initialized) throw new IllegalStateException("MCP 客户端尚未 initialize");
    }
}
