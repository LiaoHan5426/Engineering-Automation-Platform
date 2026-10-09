package com.lh.eap.web;

/**
 * Whether the platform can actually run a capability right now.
 *
 * <p>Declaring an executor is not the same as being able to run it: a CLI capability needs its binary
 * on {@code PATH}, an MCP capability needs a trusted server, and any capability can be switched off by
 * an operator. The catalog reports this instead of pretending every declared capability is live.
 *
 * <p>{@link #DISABLED} is distinct from the other two on purpose: it is not a missing prerequisite but
 * a decision someone made, so it is reported as that decision rather than as a failure to install.
 */
public enum CapabilityAvailability {
    AVAILABLE("available", "可用"),
    MISSING_BINARY("missing-binary", "缺少可执行文件"),
    NOT_CONFIGURED("not-configured", "尚未配置"),
    DISABLED("disabled", "已停用");

    private final String id;
    private final String label;

    CapabilityAvailability(String id, String label) {
        this.id = id;
        this.label = label;
    }

    public String id() { return id; }
    public String label() { return label; }

    /** True when the capability can be run right now, i.e. nothing is missing and nobody turned it off. */
    public boolean runnable() { return this == AVAILABLE; }
}
