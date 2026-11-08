package com.lh.eap.ai;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.Path;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.HexFormat;

public final class ConnectionIdentity {
    private ConnectionIdentity() {}
    public static String revision(String provider, String model, String baseUrl, boolean rootConfigured) {
        return revision(provider, model, baseUrl, rootConfigured, "");
    }

    public static String revision(String provider, String model, String baseUrl, boolean rootConfigured, String secretFingerprint) {
        String material = (provider == null ? "" : provider) + "\n" + (model == null ? "" : model) + "\n"
                + endpointIdentity(baseUrl) + "\nroot:" + rootConfigured + "\nsecret:"
                + (secretFingerprint == null ? "" : secretFingerprint);
        return sha256(material);
    }

    public static String workspaceLabel(Path workspace) {
        return RuntimeWorkspace.label(workspace);
    }

    static String pathText(Path path) {
        if (path == null) return "";
        try {
            return path.toRealPath().toString();
        } catch (Exception failure) {
            return path.toAbsolutePath().normalize().toString();
        }
    }

    static String endpointIdentity(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) return "";
        try {
            URI uri = URI.create(baseUrl);
            if (uri.getScheme() == null || uri.getHost() == null) return "invalid";
            int port = uri.getPort();
            String path = uri.getPath() == null ? "" : uri.getPath();
            return uri.getScheme() + "://" + uri.getHost() + (port > 0 ? ":" + port : "") + path;
        } catch (IllegalArgumentException invalid) {
            return "invalid";
        }
    }

    private static String sha256(String material) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}
