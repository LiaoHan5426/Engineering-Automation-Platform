package com.lh.eap.web;

import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * A stand-in for a registered MCP tool.
 *
 * <p>The runtime deliberately ships no MCP handler: a tool only exists once an operator registers a
 * server and allow-lists the tool, so {@code /api/capabilities} reports zero of them. That makes the
 * expert-scope contract untestable against real handlers, which is what this double is for — and it
 * behaves like a real one on purpose: it opens its session through {@link McpSessionRegistry} using the
 * execution and the expert it was invoked for, and it refuses to run any other way.
 */
class FakeMcpToolHandler implements CapabilityHandler {
    static final String CAPABILITY = "mcp.registrydb.query";

    private final McpSessionRegistry sessions;
    final List<McpCallScope> calls = new CopyOnWriteArrayList<>();
    final List<ShapeSession> opened = new CopyOnWriteArrayList<>();

    FakeMcpToolHandler(McpSessionRegistry sessions) {
        this.sessions = sessions;
    }

    @Override public Set<String> capabilities() { return Set.of(CAPABILITY); }

    @Override public CapabilityKind kind() { return CapabilityKind.MCP; }

    @Override public CapabilityAvailability availability() { return CapabilityAvailability.NOT_CONFIGURED; }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor(CAPABILITY, kind(),
                "查询登记库（测试替身）", "模拟一个已登记 MCP 服务器上的只读查询工具。",
                List.of("query"), List.of("专家级授权：" + CAPABILITY), "MCP 客户端（未配置）",
                List.of(), List.of("工具返回内容"), true));
    }

    @Override public NodeResult handle(CapabilityContext context) {
        var scope = McpCallScope.of(context.executionId(), context.expertId(), CAPABILITY).orElseThrow();
        var session = sessions.session(scope, () -> {
            var created = new ShapeSession(scope.serverId());
            opened.add(created);
            return created;
        });
        sessions.requireOwnership(scope, session);
        calls.add(scope);
        return new NodeResult(true, false, "已在本专家自己的会话内调用：" + scope.sessionKey(),
                Map.of("server", scope.serverId()));
    }

    /** An opaque session handle that records whether it was closed. */
    static final class ShapeSession implements McpSessionRegistry.McpSession {
        private final String serverId;
        boolean closed;

        ShapeSession(String serverId) { this.serverId = serverId; }

        @Override public String serverId() { return serverId; }
        @Override public void close() { closed = true; }
    }
}
