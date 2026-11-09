package com.lh.eap.local;

import com.lh.eap.api.ProcessIdentityInspection;
import com.lh.eap.common.SensitiveData;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.Optional;
import java.util.function.LongFunction;

/** Looks up only the caller's previously captured process identity; no scan, argv, kill or replay. */
public final class LocalProcessIdentityInspector {
    private final LongFunction<Optional<ProcessHandle>> lookup;
    public LocalProcessIdentityInspector() { this(ProcessHandle::of); }
    public LocalProcessIdentityInspector(LongFunction<Optional<ProcessHandle>> lookup) { this.lookup = lookup; }

    public ProcessIdentityInspection inspect(Long pid, String startedAt, String executable) {
        var captured = parseTime(startedAt);
        var capturedPath = bounded(executable);
        if (pid == null || pid <= 0) return result(null, "NOT_CAPTURED", captured, null, capturedPath, "");
        try {
            var found = lookup.apply(pid);
            if (found.isEmpty()) return result(pid, "NOT_FOUND", captured, null, capturedPath, "");
            var handle = found.get();
            var info = handle.info();
            var observed = info.startInstant().orElse(null);
            var command = info.command().orElse("");
            var observedPath = bounded(command);
            if (captured == null || observed == null || capturedPath.isEmpty() || command.isEmpty())
                return result(pid, "UNVERIFIABLE", captured, observed, capturedPath, observedPath);
            if (!captured.equals(observed) || !samePath(executable, command))
                return result(pid, "IDENTITY_MISMATCH", captured, observed, capturedPath, observedPath);
            return result(pid, handle.isAlive() ? "MATCHING_ALIVE" : "MATCHING_EXITED",
                    captured, observed, capturedPath, observedPath);
        } catch (SecurityException | UnsupportedOperationException failure) {
            return result(pid, "UNAVAILABLE", captured, null, capturedPath, "");
        }
    }
    private static ProcessIdentityInspection result(Long pid, String status, Instant captured, Instant observed,
                                                    String capturedPath, String observedPath) {
        return new ProcessIdentityInspection(pid, status, captured, observed, capturedPath, observedPath);
    }
    private static Instant parseTime(String value) {
        try { return value == null ? null : Instant.parse(value); }
        catch (DateTimeParseException invalid) { return null; }
    }
    private static boolean samePath(String first, String second) {
        try {
            var a = Path.of(first); var b = Path.of(second);
            return a.isAbsolute() && b.isAbsolute() && a.normalize().equals(b.normalize());
        } catch (InvalidPathException invalid) { return false; }
    }
    private static String bounded(String value) {
        if (value == null) return "";
        var safe = SensitiveData.redact(value);
        return safe.substring(0, Math.min(safe.length(), 1000));
    }
}
