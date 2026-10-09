package com.lh.eap.web;

import java.util.List;

/**
 * What an operator can actually do about a capability of a given kind.
 *
 * <p>The catalog used to be read-only for every kind, which left the natural next question unanswered:
 * "this list is nice, but where do I add one, and why can't I change that field?" The answer differs
 * per kind, and pretending otherwise is worse than saying it out loud:
 *
 * <ul>
 *   <li>A {@code command} is <em>code</em>. It extracts facts, and facts feed every rule pack — so the
 *       set of facts a capability publishes has to be reviewable code, not a row someone inserted. The
 *       platform can therefore enable, disable and annotate one, but never create one.</li>
 *   <li>A {@code cli} capability is also code (which command, which arguments, which facts), but the
 *       <em>location of the binary</em> is a property of this machine. That is the part an operator
 *       owns, and it is the part the platform lets them change.</li>
 *   <li>An {@code mcp} tool belongs to a server the operator registers: the platform stores where the
 *       server is and which of its tools are allowed, and stops there.</li>
 * </ul>
 *
 * <p>So each kind declares its management surface here, next to the kind itself, and the console builds
 * its sub-navigation from this instead of hard-coding tabs: a kind with a management surface gets a
 * page even when it currently has zero entries — that page is the entry point that makes it non-zero.
 */
public enum CapabilityManagement {
    SETTINGS("settings", "平台开关",
            "可以启用、停用并备注；不能新增或删除。",
            "由代码注册：一个实现 CapabilityHandler 的 Bean，加上 ExpertGraph.CAPABILITIES 里的一处声明；"
                    + "它发布的事实必须先在 SqlFactVocabulary 登记。新增内置命令要改代码并重新评审——"
                    + "这是刻意的：发布哪些事实属于代码契约，不能由一次界面操作产生。"),
    CLI_CHANNEL("cli-channel", "通道配置",
            "可以覆盖二进制位置、启用/停用并主动探测；不能修改命令与参数。",
            "能力本身由代码注册：执行什么命令、传什么参数、发布什么事实都写在处理器里；"
                    + "界面能改的只是本机上这个二进制在哪里。新增一种本地 CLI 能力同样需要改代码。"),
    SERVER_REGISTRY("server-registry", "服务器登记",
            "可以登记、修改、启用、信任、放行工具与删除服务器。",
            "由操作者登记：服务器由外部提供（本机进程或远端地址），平台记录它的位置和工具白名单，"
                    + "再由专家逐工具声明授权。平台既不替服务器创建工具，也不把服务器返回的内容当作已验证事实。"),
    NONE("none", "暂无管理入口",
            "该种类还没有管理入口，目录只作如实报告。",
            "尚无实现：该种类既没有处理器，也没有管理入口；目录会如实显示为零，"
                    + "而不是列出并不存在的能力，也不会给出一个点了没有反应的入口。");

    /** Rendering order for the console sub-navigation, matching {@link CapabilityKind#ORDER}. */
    public static final List<CapabilityManagement> ORDER = List.of(SETTINGS, CLI_CHANNEL, SERVER_REGISTRY, NONE);

    private final String id;
    private final String label;
    private final String description;
    private final String creation;

    CapabilityManagement(String id, String label, String description, String creation) {
        this.id = id;
        this.label = label;
        this.description = description;
        this.creation = creation;
    }

    public String id() { return id; }
    public String label() { return label; }

    /** What the operator may change. */
    public String description() { return description; }

    /** How an instance of this kind comes into existence, and why it is not a form. */
    public String creation() { return creation; }

    /** Whether a page for this kind has anything to do at all. */
    public boolean manageable() { return this != NONE; }

    public static CapabilityManagement of(String id) {
        for (var management : values()) if (management.id.equalsIgnoreCase(id)) return management;
        return NONE;
    }
}
