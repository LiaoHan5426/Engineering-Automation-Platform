package com.lh.eap.config;

import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.nio.charset.StandardCharsets;

/**
 * Server-owned workspace, authorized root and local operator label.
 * Chat and Mission both read this. The label is for display and audit, not authentication.
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
