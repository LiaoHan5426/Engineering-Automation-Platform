package com.lh.eap.config;
import com.lh.eap.error.WorkspaceErrors;

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

    public RuntimeWorkspace(Path workspace, String configuredRoot) {
        this.workspace = workspace;
        this.root = decide(configuredRoot);
    }

    /**
     * Colocated local-service factory: if the configuration is empty, bind the process root to the
     * detected workspace directory. Invalid directories still deny. Does not
     * widen to a parent of {@code workspace} or the whole disk.
     */
    public static RuntimeWorkspace colocated(Path workspace, String configuredRoot) {
        var base = new RuntimeWorkspace(workspace, configuredRoot);
        if (base.root().allowed()) {
            return base;
        }
        if (blankToNull(configuredRoot) != null) {
            return base;
        }
        if (workspace == null || !Files.isDirectory(workspace)) {
            return base;
        }
        return new RuntimeWorkspace(workspace, workspace.toAbsolutePath().normalize().toString());
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

    /** Resolve only the current authorized-root contract. */
    public static Decision decide(String configuredRoot) {
        var current = blankToNull(configuredRoot);
        var chosen = current == null ? null : directory(current);
        return chosen == null ? new Decision(null, WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code()) : new Decision(chosen, null);
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
