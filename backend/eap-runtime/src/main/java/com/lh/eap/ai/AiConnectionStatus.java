package com.lh.eap.ai;

import com.lh.eap.config.RuntimeWorkspace;
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
                           Instant lastObservedAt, String errorCode, Map<String, Boolean> tools, String workspaceLabel,
                           String connectionId, String connectionName) {}
    private record Observed(Instant at, String state, String error) {}

    private final CapabilityHandlerRegistry registry;
    private final Path workspace;
    private final Path authorizedRoot;
    private final Object lock = new Object();
    private volatile String provider;
    private volatile String model;
    private volatile String baseUrl;
    private volatile boolean rootConfigured;
    private volatile boolean modelPresent;
    private volatile String connectionId = "";
    private volatile String connectionName = "";
    private volatile String secretFingerprint = "";
    private final ModelConnections connections;
    private final java.util.Map<String, Observed> observed = new java.util.HashMap<>();

    @Autowired
    public AiConnectionStatus(CapabilityHandlerRegistry registry, RuntimeWorkspace runtime,
            @Value("${spring.ai.model.chat:none}") String provider,
            @Value("${spring.ai.openai.chat.options.model:}") String model,
            @Value("${spring.ai.openai.base-url:}") String baseUrl,
            org.springframework.beans.factory.ObjectProvider<org.springframework.ai.chat.model.ChatModel> models,
            org.springframework.beans.factory.ObjectProvider<ModelConnections> connections) {
        this(registry, runtime.workspace(), runtime.root().allowed() ? runtime.root().path() : null,
                provider, model, baseUrl, models.getIfAvailable() != null, connections.getIfAvailable());
    }

    /** Test and revision setup. Production callers use the Spring constructor. */
    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace, Path authorizedRoot,
            String provider, String model, String baseUrl, boolean modelPresent) {
        this(registry, workspace, authorizedRoot, provider, model, baseUrl, modelPresent, null);
    }

    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace, Path authorizedRoot,
            String provider, String model, String baseUrl, boolean modelPresent, ModelConnections connections) {
        this.registry = registry;
        this.workspace = workspace;
        this.authorizedRoot = authorizedRoot;
        this.provider = provider == null || provider.isBlank() ? "none" : provider;
        this.model = model == null ? "" : model;
        this.baseUrl = baseUrl == null ? "" : baseUrl;
        this.rootConfigured = authorizedRoot != null;
        this.modelPresent = modelPresent;
        this.connections = connections;
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
            refresh();
            String revision = currentRevision();
            var mark = observed.get(revision);
            return new Snapshot(currentState(mark), provider, model, revision, mark == null ? null : mark.at,
                    mark == null ? "" : mark.error, Map.of("git_status", gitStatusAvailable()), workspaceLabel(workspace),
                    connectionId, connectionName);
        }
    }

    /** Records a completed model attempt against the configuration visible now. Tool failures are not connection failures. */
    public void observe(String errorCode) {
        synchronized (lock) {
            refresh();
            if ("none".equals(provider) || !modelPresent || "AI_NOT_CONFIGURED".equals(errorCode)) return;
            observeRevision(currentRevision(), errorCode);
        }
    }

    /** Records the attempt against the revision captured when that request started. */
    public void observeRevision(String revision, String errorCode) {
        synchronized (lock) {
            if (revision == null || revision.isBlank() || "AI_NOT_CONFIGURED".equals(errorCode)) return;
            if (errorCode != null && errorCode.startsWith("AI_")) observed.put(revision, new Observed(Instant.now(), "error", errorCode));
            else observed.put(revision, new Observed(Instant.now(), "available", ""));
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

    private void refresh() {
        if (connections == null) return;
        var current = connections.effectiveDefault();
        if (current == null) {
            provider = connections.anyStored() ? "openai" : "none";
            model = "";
            baseUrl = "";
            modelPresent = false;
            connectionId = "";
            connectionName = "";
            secretFingerprint = "";
            return;
        }
        provider = "openai";
        model = current.model;
        baseUrl = current.baseUrl;
        modelPresent = current.usable();
        connectionId = current.id.toString();
        connectionName = current.name;
        secretFingerprint = ModelConnections.fingerprint(current.secret);
    }

    private String currentRevision() {
        if (connections != null) {
            var current = connections.effectiveDefault();
            if (current != null) return current.configurationRevision;
        }
        return revision(provider, model, baseUrl, rootConfigured, secretFingerprint);
    }

    private String currentState(Observed mark) {
        if ("none".equals(provider)) return "disabled";
        if (!modelPresent) return "not_configured";
        if (mark != null) return mark.state;
        return "configured_unverified";
    }

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
