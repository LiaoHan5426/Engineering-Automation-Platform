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
        return inspectionCommand(Set.of(), args);
    }

    private List<String> inspectionCommand(Set<String> filters, String... args) {
        var command = safePrefix(filters);
        if ("status".equals(operation)) {
            command.addAll(List.of("status", "--ignore-submodules=all", "--untracked-files=normal"));
        } else if ("diff".equals(operation)) {
            command.addAll(List.of("diff", "--no-ext-diff", "--no-textconv", "--ignore-submodules=all", "--no-color"));
        } else throw new IllegalArgumentException("Unsupported read-only Git operation");
        var allowed = "status".equals(operation)
                ? Set.of("--porcelain", "--porcelain=v1", "--short", "-unormal")
                : Set.of("--stat", "--name-only", "--name-status", "--cached", "--staged");
        for (String arg : args) {
            if (!allowed.contains(arg)) throw new IllegalArgumentException("Unsupported read-only Git argument");
            command.add(arg);
        }
        return List.copyOf(command);
    }

    private ArrayList<String> safePrefix(Set<String> disabledFilters) {
        var command = new ArrayList<>(List.of(binary.get(), "--no-pager", "-c", "core.quotePath=true", "-c", "color.ui=false", "-c", "core.fsmonitor=false"));
        for (var key : disabledFilters) {
            if (!key.matches("filter\\.[A-Za-z0-9_.-]+\\.(clean|process|required)")) throw new IllegalArgumentException("Unsupported filter name");
            command.addAll(List.of("-c", key + (key.endsWith(".required") ? "=false" : "=")));
        }
        return command;
    }

    /** Fixed read-only review steps; no caller-supplied paths, options or shell text. */
    public List<String> reviewCommand(String step, String baseCommit, Set<String> disabledFilters) {
        var command = safePrefix(disabledFilters);
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
        command(args); // Reject unsupported options before starting any process.
        try {
            var filters = prepare(c);
            return c.executor().runIsolated(name(), c.workspace(), inspectionCommand(filters, args), environment());
        } catch (PreflightFailure failure) { return failure.observation; }
    }

    /** Runs this capability's own command under an existing platform execution id. */
    public Observation executeManaged(UUID executionId, ExecutionContext context) {
        if (!runnable()) throw new IllegalStateException("git binary is not available");
        try {
            var filters = prepare(context);
            return context.executor().runManaged(executionId, name(), context.workspace(), inspectionCommand(filters), environment());
        } catch (PreflightFailure failure) { return failure.observation; }
    }

    private Set<String> prepare(ExecutionContext context) {
        var root = context.executor().runIsolated(name(), context.workspace(), reviewCommand("root", null, Set.of()), environment());
        requireFinished(root, false);
        if (!root.success() || Boolean.TRUE.equals(root.metadata().get("truncated"))) throw rejected("GIT_ROOT_UNAVAILABLE", root);
        try {
            if (!java.nio.file.Path.of(root.stdout().strip()).toRealPath().equals(context.workspace().toRealPath()))
                throw rejected("REPOSITORY_ROOT_MISMATCH", root);
        } catch (java.io.IOException | java.nio.file.InvalidPathException invalid) {
            throw rejected("GIT_ROOT_UNAVAILABLE", root);
        }
        var configuration = context.executor().runIsolated(name(), context.workspace(), reviewCommand("filters", null, Set.of()), environment());
        requireFinished(configuration, true);
        boolean empty = configuration.exitCode() == 1 && configuration.stdout().isBlank() && configuration.stderr().isBlank();
        if ((!configuration.success() && !empty) || Boolean.TRUE.equals(configuration.metadata().get("truncated"))) throw rejected("FILTER_CONFIGURATION_UNSUPPORTED", configuration);
        var filters = new LinkedHashSet<String>();
        for (String key : configuration.stdout().lines().filter(line -> !line.isBlank()).toList()) {
            if (!key.matches("filter\\.[A-Za-z0-9_.-]+\\.(clean|process|required)") || filters.size() >= 100) throw rejected("FILTER_CONFIGURATION_UNSUPPORTED", configuration);
            filters.add(key);
        }
        return filters;
    }

    private void requireFinished(Observation result, boolean allowNoFilters) {
        var status = result.metadata().get("executorStatus");
        boolean succeeded = "SUCCEEDED".equals(status) && result.success() && result.exitCode() == 0;
        boolean noFilters = allowNoFilters && "FAILED".equals(status) && result.exitCode() == 1
                && result.stdout().isBlank() && result.stderr().isBlank();
        if (!Boolean.TRUE.equals(result.metadata().get("processExited"))
                || !Boolean.TRUE.equals(result.metadata().get("processTreeCleanup"))
                || (!succeeded && !noFilters)) {
            // A failed/unknown preflight is real process evidence, not a command that never started.
            throw new PreflightFailure(new Observation(name(), false, result.exitCode(), "", "GIT_PREFLIGHT_UNCONFIRMED", result.metadata()));
        }
    }

    private PreflightFailure rejected(String reason, Observation preflight) {
        var metadata = new LinkedHashMap<>(preflight.metadata());
        metadata.put("executorStatus", "FAILED");
        return new PreflightFailure(new Observation(name(), false, preflight.exitCode(), "", reason, metadata));
    }

    private static final class PreflightFailure extends RuntimeException {
        final Observation observation;
        PreflightFailure(Observation observation) { this.observation = observation; }
    }

    /** Environment for this read-only git invocation. It is not a global CLI policy. */
    public static Map<String, String> environment() {
        var environment = new LinkedHashMap<String, String>();
        for (var name : List.of("SystemRoot", "WINDIR", "TEMP", "TMP", "PATH", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "XDG_CONFIG_HOME")) {
            var value = System.getenv(name);
            if (value != null) environment.put(name, value);
        }
        environment.put("GIT_OPTIONAL_LOCKS", "0");
        environment.put("GIT_TERMINAL_PROMPT", "0");
        environment.put("LC_ALL", "C");
        return environment;
    }
}
