package com.lh.eap.runtime.mcp.client;
import java.util.Collection;
import com.lh.eap.error.ProtocolErrors;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.ToolErrors;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import tools.jackson.databind.json.JsonMapper;

/**
 * Minimal read-only MCP server for protocol-loop tests. No network, no shell.
 */
public final class InMemoryMcpServer {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Set<String> allowedTools;
    private final int pageSize;
    private final AtomicBoolean closed = new AtomicBoolean();

    public InMemoryMcpServer(Collection<String> allowedTools) {
        this(allowedTools, Integer.MAX_VALUE);
    }

    public InMemoryMcpServer(Collection<String> allowedTools, int pageSize) {
        this.allowedTools = Set.copyOf(allowedTools);
        this.pageSize = Math.max(1, pageSize);
    }

    public boolean closed() {
        return closed.get();
    }

    public void close() {
        closed.set(true);
    }

    public String handle(String line) {
        if (closed.get()) return error(null, -32000, ProtocolErrors.SERVER_CLOSED.code());
        final Map<String, Object> request;
        try {
            request = JSON.readValue(line, Map.class);
        } catch (RuntimeException failure) {
            return error(null, -32700, ProtocolErrors.PARSE_ERROR.code());
        }
        var id = request.get("id");
        var method = String.valueOf(request.getOrDefault("method", ""));
        if ("notifications/initialized".equals(method)) return "";
        return switch (method) {
            case "initialize" -> success(id, Map.of(
                    "protocolVersion", McpProtocolClient.PROTOCOL_VERSION,
                    "capabilities", Map.of("tools", Map.of()),
                    "serverInfo", Map.of("name", "in-memory", "version", "0.1")));
            case "tools/list" -> listTools(id, params(request));
            case "tools/call" -> handleCall(id, params(request));
            default -> error(id, -32601, ProtocolErrors.METHOD_NOT_FOUND.code());
        };
    }

    private String listTools(Object id, Map<String, Object> params) {
        var ordered = allowedTools.stream().sorted().map(InMemoryMcpServer::toolSchema).toList();
        int offset = 0;
        if (params.get("cursor") instanceof String cursor && !cursor.isBlank()) {
            try {
                offset = Integer.parseInt(cursor);
            } catch (NumberFormatException invalid) {
                return error(id, -32602, ProtocolErrors.INVALID_CURSOR.code());
            }
        }
        if (offset < 0 || offset > ordered.size()) return error(id, -32602, ProtocolErrors.INVALID_CURSOR.code());
        int end = Math.min(offset + pageSize, ordered.size());
        var page = ordered.subList(offset, end);
        var result = new LinkedHashMap<String, Object>();
        result.put("tools", page);
        if (end < ordered.size()) result.put("nextCursor", Integer.toString(end));
        return success(id, result);
    }

    private String handleCall(Object id, Map<String, Object> params) {
        var name = String.valueOf(params.getOrDefault("name", ""));
        if (!allowedTools.contains(name)) return error(id, -32602, ToolErrors.TOOL_NOT_ALLOWED.code());
        if ("readonly.ping".equals(name)) {
            var payload = new LinkedHashMap<String, Object>();
            payload.put("content", List.of(Map.of("type", "text", "text", "pong")));
            payload.put("isError", false);
            return success(id, payload);
        }
        return error(id, -32602, ExecutionErrors.UNKNOWN_TOOL.code());
    }

    private static Map<String, Object> toolSchema(String name) {
        return Map.of(
                "name", name,
                "description", "Read-only in-memory tool",
                "inputSchema", Map.of("type", "object", "properties", Map.of()));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> params(Map<String, Object> request) {
        if (request.get("params") instanceof Map<?, ?> raw) {
            var typed = new LinkedHashMap<String, Object>();
            for (var entry : raw.entrySet()) {
                if (entry.getKey() instanceof String key) typed.put(key, entry.getValue());
            }
            return typed;
        }
        return Map.of();
    }

    private static String success(Object id, Map<String, Object> result) {
        var body = new LinkedHashMap<String, Object>();
        body.put("jsonrpc", "2.0");
        if (id != null) body.put("id", id);
        body.put("result", result);
        try {
            return JSON.writeValueAsString(body);
        } catch (RuntimeException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private static String error(Object id, int code, String message) {
        var body = new LinkedHashMap<String, Object>();
        body.put("jsonrpc", "2.0");
        if (id != null) body.put("id", id);
        body.put("error", Map.of("code", code, "message", message));
        try {
            return JSON.writeValueAsString(body);
        } catch (RuntimeException failure) {
            throw new IllegalStateException(failure);
        }
    }
}
