package com.lh.eap.application.service;
import com.lh.eap.error.CliProgramErrors;

import com.lh.eap.domain.model.CapabilityAvailability;
import com.lh.eap.common.SensitiveData;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.local.CliChannelStore;
import com.lh.eap.core.LocalBinaries;
import java.nio.file.Path;
import java.util.*;

/**
 * Where each local CLI capability's binary actually lives on <em>this</em> machine.
 *
 * <p>A CLI capability is code: which command to run, which arguments to pass and which facts to publish
 * are all decided in the handler and must stay reviewable. The one thing that cannot live in code is
 * where the executable is installed — that differs per machine, per install method and per version
 * manager. This class resolves and validates the binding; a consumer-supplied store persists it.
 *
 * <p>Two consequences worth stating:
 *
 * <ul>
 *   <li><b>The override is live.</b> The binary is resolved on every execution rather than captured when
 *       the bean was built, so changing it does not require restarting the backend. The registry hands
 *       {@code GitCapability}/{@code RipgrepCapability} a supplier, not a string.</li>
 *   <li><b>Nothing is executed to render a page.</b> Resolution is a pure lookup. Running the binary
 *       happens only in {@link #probe}, which is an explicit operator action, is bounded by a short
 *       timeout, and whose output is redacted like any other evidence.</li>
 * </ul>
 */
public class CliChannels {
    /** Probe output is capped: a management check does not need a full manual page. */
    private static final int PROBE_OUTPUT_LIMIT = 500;

    private final CliChannelStore store;
    private final ProcessExecutor probeExecutor;

    /** No executor is created implicitly; the consumer owns its lifecycle and execution boundaries. */
    public CliChannels(CliChannelStore store) { this(store, null); }

    public CliChannels(CliChannelStore store, ProcessExecutor probeExecutor) {
        this.store = store == null ? CliChannelStore.readOnlyDefaults() : store;
        this.probeExecutor = probeExecutor;
    }

    /**
     * Resolution with no operator overrides: the shipped binary name for every capability.
     *
     * <p>This is the state before {@code eap.cli_channel} has any row, and the state the tests start
     * from, so handlers can be constructed exactly the way production constructs them.
     */
    public static CliChannels defaults() { return new CliChannels(null, null); }

    /**
     * A channel as reported to the console.
     *
     * @param capability  the CLI capability id
     * @param binary      the value in effect — an operator override, or the binary the handler ships with
     * @param source      {@code shipped} or {@code operator}; the console shows which, so an override is
     *                    never mistaken for the default
     * @param resolvedPath absolute path found, or {@code null} when nothing matched
     * @param availability {@link CapabilityAvailability#MISSING_BINARY} when the binary cannot be found
     */
    public record Channel(String capability, String binary, String source, String resolvedPath,
                          CapabilityAvailability availability) {
        public boolean overridden() { return "operator".equals(source); }
    }

    /** The binary to invoke for a capability: the operator override when present, else the shipped name. */
    public String binaryFor(String capability, String shippedDefault) {
        var override = override(capability);
        return override == null ? shippedDefault : override;
    }

    /** The full channel view: what is in effect, where it resolved to, and whether it is runnable. */
    public Channel channel(String capability, String shippedDefault) {
        var override = override(capability);
        var binary = override == null ? shippedDefault : override;
        var resolved = LocalBinaries.resolve(binary);
        return new Channel(capability, binary, override == null ? "shipped" : "operator",
                resolved.map(Path::toString).orElse(null),
                resolved.isPresent() ? CapabilityAvailability.AVAILABLE : CapabilityAvailability.MISSING_BINARY);
    }

    /** Every operator override, keyed by program. */
    public Map<String, String> overrides() {
        // Never fall back to a different binary when the authoritative configuration is unreadable.
        return Map.copyOf(Objects.requireNonNull(store.overrides(), "CLI channel store returned no result"));
    }

    /**
     * Point a program at a specific binary, or clear the override ({@code binary} blank) so the
     * shipped default applies again.
     *
     * @throws IllegalArgumentException when the value could not be a binary path — control characters, a
     *                                  leading dash (which the process executor would read as a flag), an
     *                                  over-long value, or anything that looks like a credential
     */
    public void configure(String program, String binary) {
        if (program == null || !program.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || !program.equals(programId(program)))
            throw new IllegalArgumentException(CliProgramErrors.CLI_PROGRAM_ID_REQUIRED.code());
        var value = binary == null ? "" : binary.trim();
        if (value.isEmpty()) {
            store.configure(program, "");
            return;
        }
        if (value.length() > 500) throw new IllegalArgumentException(CliProgramErrors.CLI_BINARY_INVALID.code());
        if (value.startsWith("-")) throw new IllegalArgumentException(CliProgramErrors.CLI_BINARY_INVALID.code());
        if (value.chars().anyMatch(Character::isISOControl)) throw new IllegalArgumentException(CliProgramErrors.CLI_BINARY_INVALID.code());
        if (SensitiveData.containsSecret(value)) throw new IllegalArgumentException(CliProgramErrors.CLI_BINARY_INVALID.code());
        store.configure(program, value);
    }

    /**
     * Run {@code <binary> --version} and report what happened.
     *
     * <p>This is the only place the platform executes a binary to answer a management question, and it
     * exists because a pure {@code PATH} lookup cannot distinguish "installed" from "installed but
     * broken". It is an explicit operator action, bounded by a short timeout, run with an argument array
     * (never a shell), and its output is redacted and truncated before it is returned.
     */
    public Map<String, Object> probe(String capability, String shippedDefault, Path workspace) {
        var channel = channel(capability, shippedDefault);
        var result = new LinkedHashMap<String, Object>();
        result.put("capability", capability);
        result.put("binary", channel.binary());
        result.put("source", channel.source());
        result.put("resolvedPath", channel.resolvedPath());
        result.put("executed", false);
        if (channel.resolvedPath() == null) {
            result.put("output", "");
            result.put("message", "未找到可执行文件：" + channel.binary() + "。请把二进制加入 PATH，或在下方直接填写绝对路径。");
            return result;
        }
        if (probeExecutor == null) {
            result.put("message", "当前未接入进程执行器，无法探测。");
            return result;
        }
        try {
            var observation = probeExecutor.run(capability, workspace,
                    List.of(channel.binary(), "--version"));
            result.put("executed", true);
            result.put("exitCode", observation.exitCode());
            result.put("success", observation.success());
            result.put("output", SensitiveData.redact(truncate((observation.stdout() + observation.stderr()).trim())));
            result.put("message", observation.success()
                    ? "探测成功：该二进制可以启动。"
                    : "二进制存在但探测未成功（退出码 " + observation.exitCode() + "），常见原因是版本过旧或缺少运行库。");
        } catch (RuntimeException error) {
            result.put("message", "探测失败：" + error.getClass().getSimpleName());
        }
        return result;
    }

    private String override(String capability) {
        return overrides().get(programId(capability));
    }

    public static String programId(String capability) {
        return switch (capability) {
            case "git-status", "git-diff" -> "git";
            case "rg-search" -> "rg";
            default -> capability;
        };
    }

    private static String truncate(String text) {
        if (text == null) return "";
        return text.length() <= PROBE_OUTPUT_LIMIT ? text : text.substring(0, PROBE_OUTPUT_LIMIT) + "…";
    }

}
