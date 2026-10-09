package com.lh.eap.web;

import com.lh.eap.api.ExecutionContext;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.LocalBinaries;
import java.util.*;
import org.springframework.stereotype.Component;

/**
 * Read-only local Git inspection.
 *
 * <p>A {@link CapabilityKind#CLI} capability: it shells out to a local binary, so the catalog reports
 * whether that binary actually exists instead of assuming it does. Arguments are passed as an array and
 * never interpolated into a shell.
 *
 * <p>Which binary is a machine property and therefore operator-managed ({@link CliChannels}); the
 * executable it <em>ships with</em> is declared here, next to the code that invokes it, so the catalog
 * can show both the default and the override.
 */
@Component
public class GitInspectionHandler implements CapabilityHandler {
    private static final String SHIPPED_BINARY = "git";

    private final CapabilityRegistry registry;
    private final ProcessExecutor executor;
    private final CliChannels channels;

    public GitInspectionHandler(CapabilityRegistry registry, ProcessExecutor executor) {
        this(registry, executor, CliChannels.defaults());
    }

    public GitInspectionHandler(CapabilityRegistry registry, ProcessExecutor executor, CliChannels channels) {
        this.registry = registry;
        this.executor = executor;
        this.channels = channels;
    }

    @Override public Set<String> capabilities() { return Set.of("git-status", "git-diff"); }

    @Override public CapabilityKind kind() { return CapabilityKind.CLI; }

    @Override public CapabilityAvailability availability() {
        return LocalBinaries.resolve(channels.binaryFor("git-status", SHIPPED_BINARY)).isPresent()
                ? CapabilityAvailability.AVAILABLE : CapabilityAvailability.MISSING_BINARY;
    }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(
                new CapabilityDescriptor("git-status", kind(),
                        "读取本地 Git 状态",
                        "在工作空间内执行只读的 git status，输出会先脱敏再入库。不修改工作区、不推送。",
                        List.of("工作空间路径（平台注入）"),
                        List.of("读取当前工作空间"),
                        "ProcessExecutor · git status",
                        SHIPPED_BINARY,
                        List.of(),
                        List.of("stdout", "stderr", "exitCode"),
                        true),
                new CapabilityDescriptor("git-diff", kind(),
                        "读取本地 Git 差异",
                        "在工作空间内执行只读的 git diff，用于确认改动范围。不修改工作区、不推送。",
                        List.of("工作空间路径（平台注入）"),
                        List.of("读取当前工作空间"),
                        "ProcessExecutor · git diff",
                        SHIPPED_BINARY,
                        List.of(),
                        List.of("stdout", "stderr", "exitCode"),
                        true));
    }

    @Override public NodeResult handle(CapabilityContext context) {
        var result = registry.require(context.step().capability())
                .execute(new ExecutionContext(context.workspace(), executor));
        return new NodeResult(result.success(), false, "平台独立执行本地只读 Git 能力",
                Map.of("stdout", SensitiveData.redact(result.stdout()),
                        "stderr", SensitiveData.redact(result.stderr()),
                        "exitCode", result.exitCode()));
    }
}
