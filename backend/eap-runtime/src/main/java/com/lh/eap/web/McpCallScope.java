package com.lh.eap.web;

import java.util.Optional;
import java.util.UUID;

/**
 * The identity of one MCP call.
 *
 * <p>An MCP server keeps state per connection: a session id, cursors, a cached schema, and the identity
 * it authenticated. If that session were opened once and shared, expert B's call would inherit expert
 * A's context — A's grants, A's cursors, A's authenticated principal — which is exactly the confusion
 * that makes "enable MCP globally" unsafe. Every call therefore carries the execution and the expert it
 * belongs to, and {@link McpSessionRegistry} refuses to hand a session to any other pair.
 *
 * @param executionId one expert execution (one run id in {@code task})
 * @param expertId    the expert whose grants authorise the call
 * @param serverId    the registered MCP server
 * @param capability  the expert-scoped capability id, {@code mcp.<server>.<tool>}
 */
public record McpCallScope(UUID executionId, String expertId, String serverId, String capability) {

    public McpCallScope {
        if (executionId == null) throw new IllegalArgumentException("MCP 调用必须携带执行标识：会话不能在一个执行之外存在");
        if (expertId == null || expertId.isBlank()) throw new IllegalArgumentException("MCP 调用必须携带专家标识：授权是按专家记录的");
        if (serverId == null || serverId.isBlank()) throw new IllegalArgumentException("MCP 调用必须携带服务器标识");
    }

    /**
     * The session identity. Deliberately includes all three parts: two experts on the same server, or two
     * later runs of the same expert, must never land on the same key.
     */
    public String sessionKey() {
        return executionId + "|" + expertId + "|" + serverId;
    }

    /** Builds a scope from an expert-scoped capability id of the form {@code mcp.<server>.<tool>}. */
    public static Optional<McpCallScope> of(UUID executionId, String expertId, String capability) {
        var serverId = serverIdOf(capability);
        return serverId.map(id -> new McpCallScope(executionId, expertId, id, capability));
    }

    /** {@code mcp.<server>.<tool>} → {@code <server>}; empty when the id is not an MCP capability id. */
    public static Optional<String> serverIdOf(String capability) {
        if (capability == null || !capability.startsWith("mcp.")) return Optional.empty();
        var rest = capability.substring(4);
        var separator = rest.indexOf('.');
        if (separator <= 0) return Optional.empty();
        var serverId = rest.substring(0, separator);
        var tool = rest.substring(separator + 1);
        return tool.isBlank() ? Optional.empty() : Optional.of(serverId);
    }
}
