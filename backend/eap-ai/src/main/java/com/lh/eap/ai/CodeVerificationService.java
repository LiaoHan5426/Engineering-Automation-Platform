package com.lh.eap.ai;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Optional post-apply checks. Disabled by default so apply stays {@code not_requested}.
 * Never treats a missing runner as success.
 */
@Service
public final class CodeVerificationService {
    public record Spec(String name, List<String> command) {}
    public record Check(String name, Integer exitCode, String summary) {}

    private final boolean enabled;
    private final int timeoutSeconds;
    private final List<Spec> specs;
    private final Runner runner;

    /** Spring entry. Multiple constructors require an explicit {@link Autowired} choice. */
    @Autowired
    public CodeVerificationService(CodeVerificationProperties properties) {
        this(properties.isEnabled(), properties.getTimeoutSeconds(),
                properties.getCommands().stream()
                        .map(command -> new Spec(command.getName(), List.copyOf(command.getRun())))
                        .toList(),
                ProcessRunner.INSTANCE);
    }

    /** Test seam only; not selected by Spring. */
    CodeVerificationService(boolean enabled, int timeoutSeconds, List<Spec> specs, Runner runner) {
        this.enabled = enabled;
        this.timeoutSeconds = Math.max(1, timeoutSeconds);
        this.specs = List.copyOf(specs);
        this.runner = runner;
    }

    public boolean enabled() {
        return enabled && !specs.isEmpty();
    }

    public List<Check> run(Path workspace) {
        if (!enabled()) return List.of();
        var checks = new ArrayList<Check>();
        for (var spec : specs) {
            if (spec.name() == null || spec.name().isBlank() || spec.command() == null || spec.command().isEmpty()) {
                checks.add(new Check(spec.name() == null ? "" : spec.name(), null, "INVALID_CHECK_SPEC"));
                continue;
            }
            try {
                var result = runner.run(workspace, spec.command(), timeoutSeconds);
                String summary = result.output().length() <= 400 ? result.output() : result.output().substring(0, 400);
                checks.add(new Check(spec.name(), result.exitCode(), summary));
            } catch (Exception failure) {
                checks.add(new Check(spec.name(), null, failure.getClass().getSimpleName()));
            }
        }
        return List.copyOf(checks);
    }

    /**
     * Safe read-only observability probe. Always uses {@code git --version}; never enables
     * configured typecheck/test/build and never claims apply verification passed.
     */
    public Check probe(Path workspace) {
        int bound = Math.min(timeoutSeconds, 30);
        try {
            var result = runner.run(workspace, List.of("git", "--version"), bound);
            String summary = result.output().length() <= 400 ? result.output() : result.output().substring(0, 400);
            return new Check(PROBE_NAME, result.exitCode(), summary);
        } catch (Exception failure) {
            return new Check(PROBE_NAME, null, failure.getClass().getSimpleName());
        }
    }

    public static final String PROBE_NAME = "git-version-probe";

    public record ProcessResult(int exitCode, String output) {}

    public interface Runner {
        ProcessResult run(Path workspace, List<String> command, int timeoutSeconds) throws IOException, InterruptedException;
    }

    enum ProcessRunner implements Runner {
        INSTANCE;
        @Override
        public ProcessResult run(Path workspace, List<String> command, int timeoutSeconds) throws IOException, InterruptedException {
            var process = new ProcessBuilder(command)
                    .directory(workspace.toFile())
                    .redirectErrorStream(true)
                    .start();
            // Drain while waiting so large check output cannot deadlock waitFor.
            var stdout = new java.io.ByteArrayOutputStream();
            var reader = Thread.startVirtualThread(() -> {
                try {
                    process.getInputStream().transferTo(stdout);
                } catch (IOException ignored) {
                    // Closed on process exit/destroy.
                }
            });
            boolean finished = process.waitFor(timeoutSeconds, TimeUnit.SECONDS);
            if (!finished) {
                process.destroyForcibly();
                reader.join(1_000);
                return new ProcessResult(-1, "CHECK_TIMEOUT");
            }
            reader.join(1_000);
            return new ProcessResult(process.exitValue(), stdout.toString(StandardCharsets.UTF_8).strip());
        }
    }
}
