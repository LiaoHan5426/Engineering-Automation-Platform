package com.lh.eap.application.service;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.LocalBinaries;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import static com.lh.eap.application.service.BoardVerificationSource.denied;

@Service
public class BoardVerificationPlanSupport {
    public record Command(String id, List<String> command, String workingDirectory, int timeoutSeconds) {}
    public record Plan(String planHash, String workspacePath, String baseCommit, BoardVerificationSource.Source source, List<Command> commands) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ProcessExecutor executor;
    private final CliChannels channels;
    private final BoardVerificationSource sources;
    private final Semaphore capacity = new Semaphore(2);
    public BoardVerificationPlanSupport(ProcessExecutor executor, CliChannels channels, BoardVerificationSource sources) {
        this.executor = executor; this.channels = channels; this.sources = sources;
    }
    /** Explicit preparation only. GET callers must not use this method. */
    public Plan prepare(Path workspace, GitCapability git) {
        if (!capacity.tryAcquire()) throw denied("BOARD_VERIFICATION_BUSY");
        try {
            var root = workspace.toRealPath();
            var reported = invoke(root, git, "root");
            if (!Path.of(reported).toRealPath().equals(root)) throw denied("BOARD_WORKSPACE_CHANGED");
            var before = head(root, git);
            var source = sources.snapshot(root);
            var commands = commands(root);
            if (!before.equals(head(root, git))) throw denied("BOARD_VERIFICATION_PLAN_STALE");
            var hash = GitReviewCapture.hash(JSON.writeValueAsString(List.of(root.toString(), before, source, commands)));
            return new Plan(hash, root.toString(), before, source, commands);
        } catch (java.io.IOException invalid) { throw denied("BOARD_WORKSPACE_CHANGED"); }
        finally { capacity.release(); }
    }
    public String availability() {
        var channel = channels.channel("vp", "vp");
        if (channel.resolvedPath() == null) return "BOARD_VERIFICATION_BINARY_MISSING";
        if (LocalBinaries.isWindows() && !channel.resolvedPath().toLowerCase(Locale.ROOT).matches(".*\\.(exe|com)")) return "BOARD_VERIFICATION_NATIVE_BINARY_REQUIRED";
        return "";
    }
    private List<Command> commands(Path root) {
        var denial = availability(); if (!denial.isEmpty()) throw denied(denial);
        var binary = channels.channel("vp", "vp").resolvedPath();
        if (binary == null) throw denied("BOARD_VERIFICATION_BINARY_MISSING");
        var frontend = root.resolve("frontend");
        if (!Files.isRegularFile(frontend.resolve("package.json"), LinkOption.NOFOLLOW_LINKS) || !Files.isDirectory(frontend.resolve("node_modules"), LinkOption.NOFOLLOW_LINKS)) throw denied("BOARD_VERIFICATION_DEPENDENCIES_MISSING");
        return List.of(new Command("typecheck", List.of(binary, "exec", "vue-tsc", "--build"), frontend.toString(), 120),
            new Command("test", List.of(binary, "test", "run"), frontend.toString(), 120),
            new Command("build", List.of(binary, "build"), frontend.toString(), 120));
    }
    private String head(Path root, GitCapability git) {
        var value = invoke(root, git, "head");
        if (!value.matches("[a-f0-9]{40}|[a-f0-9]{64}")) throw denied("BOARD_VERIFICATION_BASE_UNAVAILABLE");
        return value;
    }
    private String invoke(Path root, GitCapability git, String step) {
        var observation = executor.runIsolated("git-status", root, git.reviewCommand(step, null, Set.of()), GitCapability.environment());
        if (!Boolean.TRUE.equals(observation.metadata().get("processTreeCleanup"))) throw denied("BOARD_VERIFICATION_PROCESS_UNKNOWN");
        if (!observation.success() || !Boolean.TRUE.equals(observation.metadata().get("processExited")) || Boolean.TRUE.equals(observation.metadata().get("truncated"))) throw denied("BOARD_VERIFICATION_BASE_UNAVAILABLE");
        return observation.stdout().strip();
    }
    /** Deliberate allowlist: never copy model credentials, NODE_OPTIONS, or package-manager auth. */
    static Map<String, String> environment() {
        var result = new LinkedHashMap<String, String>();
        for (var name : List.of("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA")) {
            var value = System.getenv(name); if (value != null) result.put(name, value);
        }
        // vp itself is native; its approved project commands still resolve local package .cmd shims.
        // Pin standard Windows extensions rather than inheriting custom executable associations.
        if (LocalBinaries.isWindows()) result.put("PATHEXT", ".COM;.EXE;.BAT;.CMD");
        result.put("CI", "true"); result.put("NO_COLOR", "1");
        return Map.copyOf(result);
    }
}
