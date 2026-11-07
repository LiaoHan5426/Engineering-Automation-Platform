package com.lh.eap.runtime.mcp.client;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import tools.jackson.databind.json.JsonMapper;

/** Minimal JSON-RPC 2.0 helpers for MCP method calls. */
public final class McpJsonRpc {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final AtomicLong IDS = new AtomicLong(1);

    private McpJsonRpc() {}

    public static String request(String method, Map<String, Object> params) {
        var body = new LinkedHashMap<String, Object>();
        body.put("jsonrpc", "2.0");
        body.put("id", IDS.getAndIncrement());
        body.put("method", method);
        body.put("params", params == null ? Map.of() : params);
        try {
            return JSON.writeValueAsString(body);
        } catch (RuntimeException failure) {
            throw new IllegalStateException("无法序列化 JSON-RPC 请求", failure);
        }
    }

    public static String notification(String method, Map<String, Object> params) {
        var body = new LinkedHashMap<String, Object>();
        body.put("jsonrpc", "2.0");
        body.put("method", method);
        body.put("params", params == null ? Map.of() : params);
        try {
            return JSON.writeValueAsString(body);
        } catch (RuntimeException failure) {
            throw new IllegalStateException("无法序列化 JSON-RPC 通知", failure);
        }
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> parseResponse(String json) {
        try {
            var tree = JSON.readValue(json, Map.class);
            if (tree.get("error") instanceof Map<?, ?> error) {
                var code = error.get("code");
                var message = error.get("message") == null ? "MCP_ERROR" : String.valueOf(error.get("message"));
                throw new McpProtocolException(message, code instanceof Number n ? n.intValue() : -1);
            }
            if (!(tree.get("result") instanceof Map<?, ?> result)) {
                throw new McpProtocolException("MCP 响应缺少 result", -1);
            }
            var typed = new LinkedHashMap<String, Object>();
            for (var entry : result.entrySet()) {
                if (entry.getKey() instanceof String key) typed.put(key, entry.getValue());
            }
            return typed;
        } catch (McpProtocolException failure) {
            throw failure;
        } catch (RuntimeException failure) {
            throw new McpProtocolException("无法解析 MCP 响应", -1, failure);
        }
    }
}
