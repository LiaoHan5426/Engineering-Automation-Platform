package com.lh.eap.web;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.stereotype.Component;

/**
 * Keeps MCP sessions from leaking across experts or executions.
 *
 * <p>This exists because of a specific failure mode. An MCP server holds state per connection — session
 * id, cursors, negotiated capabilities, and the identity it was opened for. If a runtime opened one
 * session and reused it, then every expert calling that tool would be talking through the same session:
 * a call made under expert A's grant could be served from A's state while running as B, a cursor left
 * half-consumed by one expert would skip rows for the next, and the audit trail would attribute both to
 * whoever opened it. That is "MCP 内部混乱", and it is not fixable by care at the call site — it has to
 * be structurally impossible.
 *
 * <p>The rule enforced here:
 *
 * <ol>
 *   <li>A session is created only inside an open execution, and only for one
 *       (execution, expert, server) triple — {@link McpCallScope#sessionKey()}.</li>
 *   <li>Two experts, or two runs of the same expert, get <em>different</em> sessions even on the same
 *       server. Concurrency is served by separate sessions, never by sharing one.</li>
 *   <li>A session may only be used by the scope that created it; handing it to another expert is a
 *       programming error and throws ({@link #requireOwnership}).</li>
 *   <li>Every session is closed when its execution ends, so no state survives into the next run.</li>
 * </ol>
 *
 * <p>It is deliberately not a connection pool. A future MCP client may keep its own transport cache,
 * but the session identity above it must still be per execution and per expert.
 */
@Component
public class McpSessionRegistry {
    /** Opaque handle. The MCP client implementation owns what is inside. */
    public interface McpSession extends AutoCloseable {
        String serverId();
        @Override void close();
    }

    private record Owned(McpCallScope scope, McpSession session) { }

    private final Map<String, Owned> sessions = new ConcurrentHashMap<>();
    /** executionId → the one expert that execution belongs to. */
    private final Map<UUID, String> executions = new ConcurrentHashMap<>();

    /** Marks an execution as open, owned by exactly one expert. Only then may a session be created. */
    public void beginExecution(UUID executionId, String expertId) {
        if (executionId == null) throw new IllegalArgumentException("MCP 会话必须绑定到一次执行");
        if (expertId == null || expertId.isBlank()) throw new IllegalArgumentException("MCP 会话必须绑定到一个专家");
        executions.put(executionId, expertId);
    }

    /**
     * The session for this scope, created on first use by {@code factory}.
     *
     * @throws IllegalStateException when the execution is not open, or when the caller does not belong to
     *                               it — a session created outside a run, or on behalf of another expert,
     *                               would outlive the grant that allowed it
     */
    public McpSession session(McpCallScope scope, Supplier<McpSession> factory) {
        Objects.requireNonNull(scope, "scope");
        var owner = executions.get(scope.executionId());
        if (owner == null) {
            throw new IllegalStateException("MCP 会话只能在一次专家执行内创建：执行 " + scope.executionId()
                    + " 未处于打开状态，长生命周期会话会跨专家复用授权上下文。");
        }
        if (!owner.equals(scope.expertId())) {
            throw new IllegalStateException("MCP 会话不能跨专家复用：执行 " + scope.executionId() + " 属于专家 "
                    + owner + "，但调用方是 " + scope.expertId() + "。");
        }
        var owned = sessions.computeIfAbsent(scope.sessionKey(), key -> new Owned(scope, factory.get()));
        return owned.session();
    }

    /** The session already created for this exact scope, if any. Never creates one. */
    public Optional<McpSession> existing(McpCallScope scope) {
        var owned = sessions.get(scope.sessionKey());
        return owned == null ? Optional.empty() : Optional.of(owned.session());
    }

    /**
     * Guards a call: the session must belong to the scope that is calling.
     *
     * <p>An MCP client calls this before using a cached session. It is the check that turns "we are
     * careful not to share sessions" into "sharing them cannot pass unnoticed".
     */
    public void requireOwnership(McpCallScope scope, McpSession session) {
        if (scope == null || session == null) throw new IllegalArgumentException("MCP 会话与调用范围都不能为空");
        var owner = sessions.get(scope.sessionKey());
        if (owner == null || owner.session() != session) {
            throw new IllegalStateException("MCP 会话不能跨专家或跨执行复用：调用范围 " + scope.sessionKey()
                    + " 持有的不是自己的会话（服务器 " + session.serverId() + "）。请为该专家与本次执行单独建立会话。");
        }
    }

    /** How many live sessions a server currently has — more than one means separate experts or runs. */
    public int sessionCount(String serverId) {
        return (int) sessions.values().stream().filter(owned -> owned.scope().serverId().equals(serverId)).count();
    }

    /** Close everything owned by this execution. Called from the executor's {@code finally}. */
    public int endExecution(UUID executionId) {
        var closed = 0;
        for (var entry : List.copyOf(sessions.entrySet())) {
            if (!entry.getValue().scope().executionId().equals(executionId)) continue;
            closeQuietly(entry.getValue().session());
            sessions.remove(entry.getKey());
            closed++;
        }
        executions.remove(executionId);
        return closed;
    }

    /** Shutdown hook / tests. */
    public void closeAll() {
        for (var key : List.copyOf(sessions.keySet())) {
            var owned = sessions.remove(key);
            if (owned != null) closeQuietly(owned.session());
        }
        executions.clear();
    }

    public int openSessionCount() { return sessions.size(); }

    private static void closeQuietly(McpSession session) {
        try {
            session.close();
        } catch (RuntimeException ignored) {
            // A failing close must not mask the result of the run that owned the session.
        }
    }
}
