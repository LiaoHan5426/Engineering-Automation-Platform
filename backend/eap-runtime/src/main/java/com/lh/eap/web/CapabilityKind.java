package com.lh.eap.web;

import java.util.List;

/**
 * How a capability actually gets things done.
 *
 * <p>The console used to render every capability as an interchangeable name, which hid the only thing
 * an operator needs to know: what has to exist outside the platform for this capability to work, and
 * how much trust it requires. The kind is therefore a first-class, declared property of every handler
 * rather than something the UI guesses.
 *
 * <ul>
 *   <li>{@link #COMMAND} — deterministic code inside the runtime. No external dependency, no network.</li>
 *   <li>{@link #CLI} — a local executable invoked through {@code ProcessExecutor} with an argument
 *       array (never shell interpolation). Requires the binary to be present.</li>
 *   <li>{@link #MCP} — a tool published by an MCP server. Requires an explicitly trusted server, and
 *       the platform never auto-executes whatever the server returns.</li>
 *   <li>{@link #HTTP} — a remote endpoint called under an endpoint allow-list. Requires explicit
 *       opt-in, exactly like the model gateway.</li>
 * </ul>
 */
public enum CapabilityKind {
    COMMAND("command", "内置命令", "运行时内的确定性处理器：无外部依赖、不访问网络。"),
    CLI("cli", "本地 CLI", "通过进程执行器调用本机可执行文件：参数数组传参，不做 shell 拼接，需要二进制存在。"),
    MCP("mcp", "MCP 工具", "由 MCP 服务器发布的工具：需要显式信任与放行，返回内容一律按未验证观察处理。"),
    HTTP("http", "HTTP 服务", "远端 HTTP 端点：需显式放行与端点白名单，和模型网关同一套策略。");

    public static final List<CapabilityKind> ORDER = List.of(COMMAND, CLI, MCP, HTTP);

    private final String id;
    private final String label;
    private final String description;

    CapabilityKind(String id, String label, String description) {
        this.id = id;
        this.label = label;
        this.description = description;
    }

    public String id() { return id; }

    public String label() { return label; }

    public String description() { return description; }

    /**
     * The scope a capability of this kind is born with.
     *
     * <p>In-process commands and local binaries hold no shared session, so they are platform-level. MCP
     * tools and remote endpoints do: they belong to a server that keeps state per connection, and to a
     * trust decision that is per expert. They are therefore expert-level and never enabled globally —
     * see {@link CapabilityScope} for why that distinction is load bearing.
     */
    public CapabilityScope defaultScope() {
        return this == MCP || this == HTTP ? CapabilityScope.EXPERT : CapabilityScope.PLATFORM;
    }

    /**
     * How an operator manages capabilities of this kind.
     *
     * <p>This is what decides whether the console gives the kind its own page: a kind that can be
     * managed gets one even while it is empty, because that page is the entry point that makes it stop
     * being empty. A kind with nothing to manage and nothing to show gets no page rather than a dead
     * tab. See {@link CapabilityManagement} for why the answer differs per kind.
     */
    public CapabilityManagement management() {
        return switch (this) {
            case COMMAND -> CapabilityManagement.SETTINGS;
            case CLI -> CapabilityManagement.CLI_CHANNEL;
            case MCP -> CapabilityManagement.SERVER_REGISTRY;
            case HTTP -> CapabilityManagement.NONE;
        };
    }

    public static CapabilityKind of(String id) {
        for (var kind : values()) if (kind.id.equalsIgnoreCase(id)) return kind;
        return COMMAND;
    }
}
