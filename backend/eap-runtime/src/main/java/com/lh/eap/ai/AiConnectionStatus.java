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
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** Read-only model connection state. Reading it never calls a model. */
@Component
public class AiConnectionStatus {
    /**
     * Local-service snapshot (see {@code docs/running-context.md}).
     * {@code workspacePath} / {@code authorizedRootPath} describe this JVM machine.
     * {@code authorizedRootPath} is the colocated process-bound workspace root when configured.
     * {@code storesUserDirectoryGrants} is always false: this API never accepts a remote/browser
     * multi-tenant directory-grant store (POST {@code /workspace/grants} stays refused). That does
     * <em>not</em> mean the local service may not bind a workspace via process configuration.
     * {@code verificationEnabled} / {@code verificationCommands} mirror post-apply check config;
     * enabled with an empty command list still means checks are not requested.
     */
    public record Snapshot(String state, String provider, String model, String configurationRevision,
                           Instant lastObservedAt, String errorCode, Map<String, Boolean> tools, String workspaceLabel,
                           String connectionId, String connectionName, String workspacePath,
                           String authorizedRootPath, String authorizedRootDenial,
                           boolean storesUserDirectoryGrants,
                           boolean verificationEnabled, List<String> verificationCommands) {}
    private record Observed(Instant at, String state, String error) {}

    private final CapabilityHandlerRegistry registry;
    private final Path workspace;
    private final Path authorizedRoot;
    private final String authorizedRootDenial;
    private final boolean verificationEnabled;
    private final List<String> verificationCommands;
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
            ObjectProvider<org.springframework.ai.chat.model.ChatModel> models,
            ObjectProvider<ModelConnections> connections,
            ObjectProvider<CodeVerificationProperties> verification) {
        this(registry, runtime.workspace(), runtime.root().allowed() ? runtime.root().path() : null,
                runtime.root().allowed() ? "" : runtime.root().denial(),
                provider, model, baseUrl, models.getIfAvailable() != null, connections.getIfAvailable(),
                verification.getIfAvailable());
    }

    /** Test and revision setup. Production callers use the Spring constructor. */
    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace, Path authorizedRoot,
            String provider, String model, String baseUrl, boolean modelPresent) {
        this(registry, workspace, authorizedRoot, authorizedRoot == null ? "AUTHORIZED_ROOT_MISSING" : "",
                provider, model, baseUrl, modelPresent, null, null);
    }

    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace, Path authorizedRoot,
            String provider, String model, String baseUrl, boolean modelPresent, ModelConnections connections) {
        this(registry, workspace, authorizedRoot, authorizedRoot == null ? "AUTHORIZED_ROOT_MISSING" : "",
                provider, model, baseUrl, modelPresent, connections, null);
    }

    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace, Path authorizedRoot,
            String authorizedRootDenial, String provider, String model, String baseUrl, boolean modelPresent,
            ModelConnections connections) {
        this(registry, workspace, authorizedRoot, authorizedRootDenial, provider, model, baseUrl, modelPresent,
                connections, null);
    }

    public AiConnectionStatus(CapabilityHandlerRegistry registry, Path workspace, Path authorizedRoot,
            String authorizedRootDenial, String provider, String model, String baseUrl, boolean modelPresent,
            ModelConnections connections, CodeVerificationProperties verification) {
        this.registry = registry;
        this.workspace = workspace;
        this.authorizedRoot = authorizedRoot;
        this.authorizedRootDenial = authorizedRoot == null
                ? (authorizedRootDenial == null || authorizedRootDenial.isBlank() ? "AUTHORIZED_ROOT_MISSING" : authorizedRootDenial)
                : "";
        this.provider = provider == null || provider.isBlank() ? "none" : provider;
        this.model = model == null ? "" : model;
        this.baseUrl = baseUrl == null ? "" : baseUrl;
        this.rootConfigured = authorizedRoot != null;
        this.modelPresent = modelPresent;
        this.connections = connections;
        this.verificationEnabled = verification != null && verification.isEnabled();
        this.verificationCommands = verification == null ? List.of() : verification.getCommands().stream()
                .map(CodeVerificationProperties.Command::getName)
                .map(name -> name == null ? "" : name.trim())
                .filter(name -> !name.isEmpty())
                .toList();
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
                    connectionId, connectionName, pathText(workspace), pathText(authorizedRoot), authorizedRootDenial,
                    false, verificationEnabled, verificationCommands);
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
