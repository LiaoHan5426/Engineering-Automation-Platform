package com.lh.eap.capability;

import com.lh.eap.application.service.CliChannels;

import com.lh.eap.api.*;
import com.lh.eap.core.LocalBinaries;

import java.util.*;
import java.util.function.Supplier;

/**
 * Read-only {@code git status} / {@code git diff}.
 *
 * <p>The binary is a supplier rather than a string because it is an operator-managed value: the
 * capability code decides <em>what</em> to run and with which arguments, while {@code CliChannels}
 * decides <em>where</em> the executable is on this machine. Resolving it per execution keeps an override
 * live instead of requiring a restart, and the argument array is never interpolated into a shell.
 */
public final class GitCapability implements Capability {
    private final String operation;
    private final Supplier<String> binary;

    public GitCapability(String operation) {
        this(operation, () -> "git");
    }

    public GitCapability(String operation, Supplier<String> binary) {
        this.operation = operation;
        this.binary = binary;
    }

    public String name() {
        return "git-" + operation;
    }

    public String executable() {
        return binary.get();
    }

    public boolean runnable() {
        return LocalBinaries.resolve(binary.get()).isPresent();
    }

    /** The only argv constructor for this capability. Callers do not assemble git commands. */
    public List<String> command(String... args) {
        var command = new ArrayList<>(List.of(binary.get(), operation));
        command.addAll(List.of(args));
        return List.copyOf(command);
    }

    /** Fixed read-only review steps; no caller-supplied paths, options or shell text. */
    public List<String> reviewCommand(String step, String baseCommit, Set<String> disabledFilters) {
        if (!"diff".equals(operation)) throw new IllegalStateException("git-diff required");
        var command = new ArrayList<>(List.of(binary.get(), "--no-pager", "-c", "core.quotePath=true", "-c", "color.ui=false", "-c", "core.fsmonitor=false"));
        for (var key : disabledFilters) {
            if (!key.matches("filter\\.[A-Za-z0-9_.-]+\\.(clean|process|required)")) throw new IllegalArgumentException("Unsupported filter name");
            command.addAll(List.of("-c", key + (key.endsWith(".required") ? "=false" : "=")));
        }
        switch (step) {
            case "root" -> command.addAll(List.of("rev-parse", "--show-toplevel"));
            case "filters" -> command.addAll(List.of("config", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|process|required)$"));
            case "head", "head-after" -> command.addAll(List.of("rev-parse", "--verify", "HEAD"));
            case "status", "status-after" -> command.addAll(List.of("status", "--porcelain=v1", "--untracked-files=normal", "--ignore-submodules=all"));
            case "diff", "diff-after", "check" -> {
                if (baseCommit == null || !baseCommit.matches("[0-9a-f]{40}|[0-9a-f]{64}")) throw new IllegalArgumentException("Invalid captured commit");
                command.addAll(List.of("diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--ignore-submodules=all"));
                if ("check".equals(step)) command.add("--check");
                else command.addAll(List.of("--no-color", "--src-prefix=a/", "--dst-prefix=b/"));
                command.addAll(List.of(baseCommit, "--", "."));
            }
            default -> throw new IllegalArgumentException("Unknown review step");
        }
        return List.copyOf(command);
    }

    public Observation execute(ExecutionContext c, String... args) {
        return c.executor().run(name(), c.workspace(), command(args));
    }

    /** Runs this capability's own command under an existing platform execution id. */
    public Observation executeManaged(UUID executionId, ExecutionContext context) {
        if (!runnable()) throw new IllegalStateException("git binary is not available");
        return context.executor().runManaged(executionId, name(), context.workspace(), command(), environment());
    }

    /** Environment for this read-only git invocation. It is not a global CLI policy. */
    public static Map<String, String> environment() {
        var environment = new LinkedHashMap<String, String>();
        for (var name : List.of("SystemRoot", "WINDIR", "TEMP", "TMP", "PATH")) {
            var value = System.getenv(name);
            if (value != null) environment.put(name, value);
        }
        return environment;
    }
}
