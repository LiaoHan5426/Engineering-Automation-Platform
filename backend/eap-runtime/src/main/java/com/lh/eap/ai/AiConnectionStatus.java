package com.lh.eap.ai;

import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Read-only model connection state. Reading it never calls a model. */
@Component
public class AiConnectionStatus {
    public record Snapshot(String state, String provider, String model, String configurationRevision,
                           Instant lastObservedAt, String errorCode, Map<String, Boolean> tools, String workspaceLabel) {}

    private final CapabilityHandlerRegistry registry;
    private final Path workspace;
    private final Path authorizedRoot;
    private final Object lock = new Object();
    private volatile String provider;
    private volatile String model;
    private volatile String baseUrl;
    private volatile boolean rootConfigured;
    private volatile boolean modelPresent;
    private String observedRevision = "";
    private String observedState = "";
    private Instant observedAt;
    private String observedError = "";

    @Autowired
    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace,
            @Value("${eap.ai.authorized-root:}") String authorizedRoot,
            @Value("${spring.ai.model.chat:none}") String provider,
            @Value("${spring.ai.openai.chat.options.model:}") String model,
            @Value("${spring.ai.openai.base-url:}") String baseUrl,
            org.springframework.beans.factory.ObjectProvider<org.springframework.ai.chat.model.ChatModel> models) {
        this.registry = registry;
        this.workspace = workspace;
        this.authorizedRoot = authorizedRoot == null || authorizedRoot.isBlank() ? null : Path.of(authorizedRoot);
        this.provider = provider == null || provider.isBlank() ? "none" : provider;
        this.model = model == null ? "" : model;
        this.baseUrl = baseUrl == null ? "" : baseUrl;
        this.rootConfigured = this.authorizedRoot != null;
        this.modelPresent = models.getIfAvailable() != null;
    }

    /** Test and revision setup. Production callers use the Spring constructor. */
    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace, Path authorizedRoot,
            String provider, String model, String baseUrl, boolean modelPresent) {
        this.registry = registry;
        this.workspace = workspace;
        this.authorizedRoot = authorizedRoot;
        this.provider = provider == null || provider.isBlank() ? "none" : provider;
        this.model = model == null ? "" : model;
        this.baseUrl = baseUrl == null ? "" : baseUrl;
        this.rootConfigured = authorizedRoot != null;
        this.modelPresent = modelPresent;
    }

    public void replaceConfiguration(String provider, String model, String baseUrl, boolean modelPresent) {
        synchronized (lock) {
            this.provider = provider == null || provider.isBlank() ? "none" : provider;
            this.model = model == null ? "" : model;
            this.baseUrl = baseUrl == null ? "" : baseUrl;
            this.modelPresent = modelPresent;
        }
    }

    public Snapshot read() {
        synchronized (lock) {
            String revision = revision(provider, model, baseUrl, rootConfigured);
            if (!revision.equals(observedRevision)) {
                observedRevision = revision;
                observedState = "";
                observedAt = null;
                observedError = "";
            }
            String state = currentState();
            return new Snapshot(state, provider, model, revision, observedAt, observedError,
                    Map.of("git_status", gitStatusAvailable()), workspaceLabel(workspace));
        }
    }

    /** Records a completed model attempt. Tool failures are not connection failures. */
    public void observe(String errorCode) {
        synchronized (lock) {
            if ("none".equals(provider) || !modelPresent || "AI_NOT_CONFIGURED".equals(errorCode)) return;
            String revision = revision(provider, model, baseUrl, rootConfigured);
            if (!revision.equals(observedRevision)) {
                observedRevision = revision;
                observedState = "";
                observedAt = null;
                observedError = "";
            }
            observedAt = Instant.now();
            if (errorCode != null && errorCode.startsWith("AI_")) {
                observedState = "error";
                observedError = errorCode;
            } else {
                observedState = "available";
                observedError = "";
            }
        }
    }

    public boolean gitStatusAvailable() {
        if (authorizedRoot == null || workspace == null || registry.resolveFor(null, "git-status").isEmpty()) return false;
        try {
            return workspace.toRealPath().startsWith(authorizedRoot.toRealPath());
        } catch (Exception failure) {
            return false;
        }
    }

    private String currentState() {
        if ("none".equals(provider)) return "disabled";
        if (!modelPresent) return "not_configured";
        if ("available".equals(observedState) || "error".equals(observedState)) return observedState;
        return "configured_unverified";
    }

    public static String revision(String provider, String model, String baseUrl, boolean rootConfigured) {
        String material = (provider == null ? "" : provider) + "\n" + (model == null ? "" : model) + "\n"
                + endpointIdentity(baseUrl) + "\nroot:" + rootConfigured;
        return sha256(material);
    }

    public static String workspaceLabel(Path workspace) {
        if (workspace == null) return "ws-unbound";
        return "ws-" + sha256(workspace.toAbsolutePath().normalize().toString()).substring(0, 12);
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
