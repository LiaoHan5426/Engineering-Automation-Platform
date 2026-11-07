package com.lh.eap.runtime.mcp.client;

import java.io.IOException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Offline-capable MCP client: initialize → tools/list → tools/call over a {@link McpTransport}.
 */
public final class McpProtocolClient {
    public static final String PROTOCOL_VERSION = "2024-11-05";

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
        var result = call("tools/list", Map.of());
        if (!(result.get("tools") instanceof List<?> tools)) return List.of();
        return tools.stream().filter(Map.class::isInstance).map(item -> (Map<String, Object>) item).toList();
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
