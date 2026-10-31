package com.lh.eap.application.service;

import com.lh.eap.api.Observation;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.common.SensitiveData;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Semaphore;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Bounded observations of the current worktree, never proof that the linked Run produced a change. */
@Service
public class GitReviewCapture {
    public record Step(String name, List<String> command, int exitCode, String processStatus, boolean truncated, String stderr) {}
    public record Check(String status, Integer exitCode, String output) {}
    public record Snapshot(String workspacePath, String baseCommit, String headAfter, Instant startedAt, Instant finishedAt,
                           String status, List<String> issues, String repositoryStatus, String diff, Check check, List<Step> steps) {}
    public record Evidence(String contentHash, Snapshot snapshot) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ProcessExecutor executor;
    private final Semaphore capacity = new Semaphore(2);
    public GitReviewCapture(ProcessExecutor executor) { this.executor = executor; }

    public Evidence capture(Path workspace, GitCapability git) {
        if (!capacity.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "BOARD_REVIEW_BUSY");
        try { return new Capture(workspace, git).run(); }
        finally { capacity.release(); }
    }
    private final class Capture {
        private final Path workspace;
        private final GitCapability git;
        private final Instant started = Instant.now();
        private final long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(30);
        private final List<Step> steps = new ArrayList<>();
        private final Set<String> issues = new LinkedHashSet<>();
        private final Set<String> disabledFilters = new LinkedHashSet<>();
        private String base = "", headAfter = "", diff = "", status = "", state = "CAPTURED";
        private Check check = new Check("NOT_RUN", null, "");
        Capture(Path workspace, GitCapability git) { this.workspace = workspace; this.git = git; }
        Evidence run() {
            try {
                var root = invoke("root");
                if (!root.success() || !Path.of(root.stdout().strip()).toRealPath().equals(workspace.toRealPath())) {
                    issues.add("REPOSITORY_ROOT_MISMATCH"); state = "FAILED"; return finish();
                }
                var filters = invoke("filters");
                if (Boolean.TRUE.equals(filters.metadata().get("truncated"))) throw new CaptureFailure("FILTER_CONFIGURATION_UNSUPPORTED");
                for (var key : filters.stdout().lines().filter(line -> !line.isBlank()).toList()) {
                    if (!key.matches("filter\\.[A-Za-z0-9_.-]+\\.(clean|process|required)") || disabledFilters.size() >= 100) throw new CaptureFailure("FILTER_CONFIGURATION_UNSUPPORTED");
                    disabledFilters.add(key);
                }
                if (!disabledFilters.isEmpty()) issues.add("FILTERS_DISABLED");
                base = invoke("head").stdout().strip();
                if (!base.matches("[0-9a-f]{40}|[0-9a-f]{64}")) throw new CaptureFailure("BASE_COMMIT_UNAVAILABLE");
                var beforeStatus = invoke("status"); status = clip(beforeStatus.stdout(), 32768);
                var beforeDiff = invoke("diff"); diff = clip(beforeDiff.stdout(), 131072);
                var checked = invoke("check");
                check = new Check(Boolean.TRUE.equals(checked.metadata().get("truncated")) ? "INCOMPLETE" : checked.exitCode() == 0 ? "PASSED" : "FAILED",
                        checked.exitCode(), clip(checked.stdout() + checked.stderr(), 8192));
                if (check.status().equals("INCOMPLETE")) issues.add("OUTPUT_TRUNCATED");
                if (beforeStatus.stdout().lines().anyMatch(line -> line.startsWith("?? "))) issues.add("UNTRACKED_NOT_INCLUDED");
                if (beforeDiff.stdout().lines().anyMatch(line -> line.startsWith("Binary files "))) issues.add("BINARY_NOT_EXPANDED");
                var afterDiff = invoke("diff-after");
                var afterStatus = invoke("status-after");
                headAfter = invoke("head-after").stdout().strip();
                if (!base.equals(headAfter) || !beforeStatus.stdout().equals(afterStatus.stdout()) || !beforeDiff.stdout().equals(afterDiff.stdout())) {
                    state = "CHANGED"; issues.add("WORKSPACE_CHANGED_DURING_CAPTURE"); check = new Check("STALE", check.exitCode(), check.output());
                } else if (!issues.isEmpty()) state = "INCOMPLETE";
            } catch (CaptureFailure failure) {
                issues.add(failure.getMessage()); state = "FAILED";
            } catch (Exception failure) {
                issues.add("CAPTURE_FAILED"); state = "FAILED";
            }
            return finish();
        }
        private Observation invoke(String step) {
            if (System.nanoTime() > deadline) throw new CaptureFailure("CAPTURE_TIME_LIMIT");
            var command = git.reviewCommand(step, base, disabledFilters);
            var env = new LinkedHashMap<>(GitCapability.environment());
            env.put("GIT_OPTIONAL_LOCKS", "0"); env.put("GIT_TERMINAL_PROMPT", "0");
            // Preserve normal line-ending rules; suppress executable helpers via fixed argv.
            for (var name : List.of("HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "XDG_CONFIG_HOME")) {
                var value = System.getenv(name); if (value != null) env.put(name, value);
            }
            env.put("LC_ALL", "C");
            var result = executor.runIsolated("git-diff", workspace, command, env);
            boolean truncated = Boolean.TRUE.equals(result.metadata().get("truncated"));
            if (truncated) issues.add("OUTPUT_TRUNCATED");
            var processStatus = String.valueOf(result.metadata().getOrDefault("executorStatus", "UNKNOWN"));
            steps.add(new Step(step, command, result.exitCode(), processStatus, truncated, clip(result.stderr(), 4096)));
            boolean whitespaceFailure = step.equals("check") && (result.exitCode() == 1 || result.exitCode() == 2) && processStatus.equals("FAILED");
            boolean noFilters = step.equals("filters") && result.exitCode() == 1 && processStatus.equals("FAILED") && result.stdout().isBlank() && result.stderr().isBlank();
            if (!Boolean.TRUE.equals(result.metadata().get("processExited")) || (!processStatus.equals("SUCCEEDED") && !whitespaceFailure && !noFilters) || (!result.success() && !whitespaceFailure && !noFilters))
                throw new CaptureFailure(step.equals("head") ? "BASE_COMMIT_UNAVAILABLE" : "GIT_STEP_FAILED");
            return result;
        }
        private String clip(String value, int limit) {
            var safe = SensitiveData.redact(value);
            if (!safe.equals(value)) issues.add("CONTENT_REDACTED");
            if (safe.length() > limit) { issues.add("OUTPUT_TRUNCATED"); return safe.substring(0, limit); }
            return safe;
        }
        private Evidence finish() {
            if (state.equals("FAILED") && !check.status().equals("NOT_RUN")) check = new Check("INCOMPLETE", check.exitCode(), check.output());
            var snapshot = new Snapshot(workspace.toString(), base, headAfter, started, Instant.now(), state, List.copyOf(issues), status, diff, check, List.copyOf(steps));
            return new Evidence(hash(JSON.writeValueAsString(snapshot)), snapshot);
        }
    }
    private static final class CaptureFailure extends RuntimeException { CaptureFailure(String reason) { super(reason); } }
    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
}
