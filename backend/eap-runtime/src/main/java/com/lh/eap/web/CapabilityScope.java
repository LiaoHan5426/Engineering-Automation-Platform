package com.lh.eap.web;

import java.util.List;

/**
 * Who is allowed to turn a capability on.
 *
 * <p>The runtime previously had one notion of "registered", which meant that a capability backed by a
 * bean was immediately usable by every expert. That is wrong for anything that talks to an external
 * service with its own session: two experts calling the same MCP server would share whatever state that
 * server keeps for the connection (session id, cursors, cached schema, the auth context of whoever
 * opened it), and the second expert never authorised that. The tool would also be listed in the
 * capability picker as if it were a platform command.
 *
 * <p>Scope makes the difference explicit, and it is a property of the handler, not a UI convention.
 *
 * <ul>
 *   <li>{@link #PLATFORM} — deterministic in-process or local-binary work. Registered once, runnable by
 *       any expert that puts the node in its graph. It holds no cross-invocation state, so sharing it is
 *       safe.</li>
 *   <li>{@link #EXPERT} — an external tool with its own session and trust boundary (MCP tools, remote
 *       HTTP endpoints). It is <em>never</em> globally enabled: the expert must declare it in its
 *       manifest, activation records the grant, the graph may only contain nodes the expert declared,
 *       and each call runs in a session owned by exactly one (execution, expert, server) triple.</li>
 * </ul>
 */
public enum CapabilityScope {
    PLATFORM("platform", "平台级",
            "随运行时注册即生效，任何专家只要在流程中引用该节点即可执行；不持有跨调用状态。"),
    EXPERT("expert", "专家级",
            "不在运行时全局启用：必须由专家清单显式声明、在启用时授权，并只在这一次执行、这一个专家自己的会话内调用。");

    /** Rendering order for the console. */
    public static final List<CapabilityScope> ORDER = List.of(PLATFORM, EXPERT);

    private final String id;
    private final String label;
    private final String description;

    CapabilityScope(String id, String label, String description) {
        this.id = id;
        this.label = label;
        this.description = description;
    }

    public String id() { return id; }
    public String label() { return label; }
    public String description() { return description; }

    public static CapabilityScope of(String id) {
        for (var scope : values()) if (scope.id.equalsIgnoreCase(id)) return scope;
        return PLATFORM;
    }
}
