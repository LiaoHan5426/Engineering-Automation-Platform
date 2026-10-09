package com.lh.eap.core;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.Path;
import java.util.*;

/**
 * Locates local executables without spawning anything.
 *
 * <p>CLI capabilities are only runnable when their binary exists. Probing with {@code --version} would
 * execute a third-party program just to render a page, so the catalog does a pure lookup instead: it is
 * deterministic, free, and cannot have side effects. An operator-triggered probe is the only place the
 * platform runs a binary to answer a management question — that one is explicit, bounded and reported
 * (see {@code CliChannels.probe}).
 */
public final class LocalBinaries {
    private static final List<String> WINDOWS_EXTENSIONS = List.of(".exe", ".cmd", ".bat", ".com", "");

    private LocalBinaries() { }

    /**
     * The absolute path of an operator-specified binary.
     *
     * <p>Two shapes are accepted, because both are legitimate answers to "where is it": a bare command
     * name ({@code rg}), which is looked up on {@code PATH}, and an absolute path
     * ({@code C:\tools\rg.exe}), which is used as-is. Nothing is executed either way, and neither shape
     * goes through a shell — the value is passed to the process executor as a single argv element.
     */
    public static Optional<Path> resolve(String binaryOrPath) {
        if (binaryOrPath == null || binaryOrPath.isBlank()) return Optional.empty();
        var value = binaryOrPath.trim();
        if (value.indexOf(File.separatorChar) >= 0 || value.indexOf('/') >= 0 || value.indexOf('\\') >= 0) {
            try {
                var candidate = Path.of(value);
                return Files.isRegularFile(candidate) ? Optional.of(candidate.toAbsolutePath().normalize())
                        : Optional.empty();
            } catch (InvalidPathException error) {
                return Optional.empty();
            }
        }
        return locate(value);
    }

    /** The absolute path of {@code binary} on {@code PATH}, or empty when it is not installed. */
    public static Optional<Path> locate(String binary) {
        if (binary == null || binary.isBlank()) return Optional.empty();
        var path = System.getenv("PATH");
        if (path == null || path.isBlank()) return Optional.empty();
        boolean windows = isWindows();
        for (var entry : path.split(File.pathSeparator)) {
            if (entry.isBlank()) continue;
            for (var extension : windows ? WINDOWS_EXTENSIONS : List.of("")) {
                try {
                    var candidate = Path.of(entry, binary + extension);
                    if (Files.isRegularFile(candidate)) return Optional.of(candidate.toAbsolutePath().normalize());
                } catch (InvalidPathException ignored) {
                    // A malformed PATH entry is not a reason to stop looking.
                }
            }
        }
        return Optional.empty();
    }

    public static boolean available(String binary) { return locate(binary).isPresent(); }

    public static boolean isWindows() {
        return System.getProperty("os.name", "").toLowerCase(Locale.ROOT).contains("win");
    }
}
