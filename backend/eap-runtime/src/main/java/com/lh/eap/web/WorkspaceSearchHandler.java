package com.lh.eap.web;

import com.lh.eap.api.ExecutionContext;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.LocalBinaries;
import java.util.*;
import org.springframework.stereotype.Component;

/**
 * Bounded local ripgrep search used to locate evidence inside the workspace.
 *
 * <p>Like Git, this is a {@link CapabilityKind#CLI} capability: the pattern comes from the operator and
 * is passed as a single argv element, never through a shell, and the binary location is operator-managed
 * through {@link CliChannels} while the command line itself stays in code.
 */
@Component
public class WorkspaceSearchHandler implements CapabilityHandler {
    private static final String CAPABILITY = "rg-search";
    private static final String SHIPPED_BINARY = "rg";

    private final CapabilityRegistry registry;
    private final ProcessExecutor executor;
    private final CliChannels channels;

    public WorkspaceSearchHandler(CapabilityRegistry registry, ProcessExecutor executor) {
        this(registry, executor, CliChannels.defaults());
    }

    public WorkspaceSearchHandler(CapabilityRegistry registry, ProcessExecutor executor, CliChannels channels) {
        this.registry = registry;
        this.executor = executor;
        this.channels = channels;
    }

    @Override public Set<String> capabilities() { return Set.of(CAPABILITY); }

    @Override public CapabilityKind kind() { return CapabilityKind.CLI; }

    @Override public CapabilityAvailability availability() {
        return LocalBinaries.resolve(channels.binaryFor(CAPABILITY, SHIPPED_BINARY)).isPresent()
                ? CapabilityAvailability.AVAILABLE : CapabilityAvailability.MISSING_BINARY;
    }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor(CAPABILITY, kind(),
                "工作空间检索",
                "用 ripgrep 在工作空间内做有界检索，用于定位代码或配置证据。忽略 .git，参数以数组传入，不做 shell 拼接。",
                List.of("pattern（最多500字符）"),
                List.of("读取当前工作空间"),
                "ProcessExecutor · rg --line-number --hidden",
                SHIPPED_BINARY,
                List.of(),
                List.of("stdout", "stderr", "exitCode"),
                true));
    }

    @Override public NodeResult handle(CapabilityContext context) {
        var pattern = SensitiveData.redact(context.request().pattern()).trim();
        if (pattern.isBlank() || pattern.length() > 500) {
            return new NodeResult(false, true, "请提供不超过500字符的检索目标", Map.of());
        }
        var result = registry.require(CAPABILITY).execute(new ExecutionContext(context.workspace(), executor), pattern);
        return new NodeResult(result.exitCode() == 0 || result.exitCode() == 1, false,
                "已执行本地检索，退出码1表示无匹配",
                Map.of("stdout", SensitiveData.redact(result.stdout()),
                        "stderr", SensitiveData.redact(result.stderr()),
                        "exitCode", result.exitCode()));
    }
}
