package com.lh.eap.config;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

/**
 * Process-local workspace identity for the colocated local Java service.
 * <p>{@code authorized-root} is this JVM's process-bound workspace root. Browser paths and remote
 * multi-tenant grant stores are not accepted here. When no explicit root is configured, production
 * wiring may fall back to the detected process {@link #workspace()} via {@link #colocated}.
 */
public final class RuntimeWorkspace {
    public static final String OPERATOR_LABEL = "local-operator";

    public record Decision(Path path, String denial) {
        public boolean allowed() {
            return denial == null && path != null;
        }
    }

    private final Path workspace;
    private final Decision root;

    public RuntimeWorkspace(Path workspace, String configuredRoot, String legacyRoot) {
        this.workspace = workspace;
        this.root = decide(configuredRoot, legacyRoot);
    }

    /**
     * Colocated local-service factory: if both config keys are empty, bind the process root to the
     * detected workspace directory. Explicit conflicts and invalid directories still deny. Does not
     * widen to a parent of {@code workspace} or the whole disk.
     */
    public static RuntimeWorkspace colocated(Path workspace, String configuredRoot, String legacyRoot) {
        var base = new RuntimeWorkspace(workspace, configuredRoot, legacyRoot);
        if (base.root().allowed()) {
            return base;
        }
        if (!"AUTHORIZED_ROOT_MISSING".equals(base.root().denial())) {
            return base;
        }
        if (workspace == null || !Files.isDirectory(workspace)) {
            return base;
        }
        return new RuntimeWorkspace(workspace, workspace.toAbsolutePath().normalize().toString(), "");
    }

    public Path workspace() {
        return workspace;
    }

    public Decision root() {
        return root;
    }

    public String operatorLabel() {
        return OPERATOR_LABEL;
    }

    public String workspaceLabel() {
        return label(workspace);
    }

    /** New key wins only when it is the only one set, or both real paths are the same directory. */
    public static Decision decide(String configuredRoot, String legacyRoot) {
        var current = blankToNull(configuredRoot);
        var legacy = blankToNull(legacyRoot);
        if (current == null && legacy == null) {
            return new Decision(null, "AUTHORIZED_ROOT_MISSING");
        }
        if (current != null && legacy != null) {
            var left = directory(current);
            var right = directory(legacy);
            if (left == null || right == null || !left.equals(right)) {
                return new Decision(null, "ROOT_CONFLICT");
            }
            return new Decision(left, null);
        }
        var chosen = directory(current != null ? current : legacy);
        if (chosen == null) {
            return new Decision(null, "AUTHORIZED_ROOT_MISSING");
        }
        return new Decision(chosen, null);
    }

    public static String label(Path workspace) {
        if (workspace == null) return "ws-unbound";
        return "ws-" + sha256(workspace.toAbsolutePath().normalize().toString()).substring(0, 12);
    }

    private static Path directory(String value) {
        try {
            var path = Path.of(value.trim());
            if (!Files.isDirectory(path)) return null;
            return path.toRealPath();
        } catch (Exception failure) {
            return null;
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String sha256(String material) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
