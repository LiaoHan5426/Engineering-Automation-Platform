package com.lh.eap.ai;

import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.llm.EndpointPolicy;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Local model connections for the existing OpenAI-compatible integration.
 * Environment properties are a compatibility default only while the user has saved nothing.
 */
@Component
public final class ModelConnections {
    public static final String KIND = "openai-compatible";
    public static final UUID ENVIRONMENT_ID = UUID.fromString("00000000-0000-4000-8000-000000000001");
    private static final int LIMIT = 16;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Path file;
    private final String environmentProvider;
    private final String environmentModel;
    private final String environmentBaseUrl;
    private final String environmentSecret;
    private final boolean rootConfigured;
    private final ModelClientSource clients;
    private final ConcurrentHashMap<String, org.springframework.ai.chat.client.ChatClient> chatClients = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, org.springframework.ai.chat.client.ChatClient> completionClients = new ConcurrentHashMap<>();
    private final Object lock = new Object();

    @Autowired
    public ModelConnections(@Value("${eap.ai.connection-store:.eap/model-connections.json}") String file,
            @Value("${spring.ai.model.chat:none}") String provider,
            @Value("${spring.ai.openai.chat.options.model:}") String model,
            @Value("${spring.ai.openai.base-url:}") String baseUrl,
            @Value("${spring.ai.openai.api-key:}") String apiKey,
            RuntimeWorkspace runtime, ModelClientSource clients) {
        this(Path.of(file), provider, model, baseUrl, apiKey, runtime.root().allowed(), clients);
    }

    public ModelConnections(Path file, String provider, String model, String baseUrl, String apiKey,
            boolean rootConfigured, ModelClientSource clients) {
        this.file = file;
        this.environmentProvider = provider == null || provider.isBlank() ? "none" : provider;
        this.environmentModel = model == null ? "" : model;
        this.environmentBaseUrl = baseUrl == null ? "" : baseUrl;
        this.environmentSecret = apiKey == null ? "" : apiKey;
        this.rootConfigured = rootConfigured;
        this.clients = clients;
    }

    public Listing list() {
        synchronized (lock) {
            var stored = read();
            var items = new ArrayList<ModelConnectionView>();
            stored.stream().sorted(Comparator.comparing(row -> row.name)).map(row -> snapshot(row).view()).forEach(items::add);
            var environment = environment();
            if (environment != null) items.add(environment.view());
            var effective = effective(stored, environment);
            return new Listing(List.copyOf(items), effective == null ? null : effective.id);
        }
    }

    public ModelConnectionSnapshot effectiveDefault() {
        synchronized (lock) {
            var stored = read();
            return effective(stored, environment());
        }
    }

    public ModelConnectionView create(String name, String baseUrl, String model, String secret, boolean enabled,
            boolean makeDefault) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            if (stored.size() >= LIMIT) throw status(HttpStatus.CONFLICT, "CONNECTION_LIMIT");
            var row = new Row();
            row.id = UUID.randomUUID();
            row.kind = KIND;
            row.revision = 1;
            fill(row, name, baseUrl, model, secret, true);
            row.enabled = enabled;
            row.defaultSelected = makeDefault || stored.isEmpty();
            if (row.defaultSelected) stored.forEach(item -> item.defaultSelected = false);
            stored.add(row);
            write(stored);
            return snapshot(row).view();
        }
    }

    public ModelConnectionView update(UUID id, String name, String baseUrl, String model, String secret, boolean enabled,
            boolean makeDefault) {
        synchronized (lock) {
            rejectEnvironment(id);
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            var nextSecret = secret == null || secret.isBlank() ? row.secret : secret;
            boolean material = !row.baseUrl.equals(normalizeUrl(baseUrl)) || !row.model.equals(requireText(model, 120))
                    || !row.secret.equals(checkedSecret(nextSecret));
            fill(row, name, baseUrl, model, nextSecret, false);
            row.enabled = enabled;
            if (material) row.revision++;
            if (makeDefault) {
                stored.forEach(item -> item.defaultSelected = false);
                row.defaultSelected = true;
            }
            write(stored);
            return snapshot(row).view();
        }
    }

    public ModelConnectionView setEnabled(UUID id, boolean enabled) {
        synchronized (lock) {
            rejectEnvironment(id);
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            row.enabled = enabled;
            write(stored);
            return snapshot(row).view();
        }
    }

    public ModelConnectionView setDefault(UUID id) {
        synchronized (lock) {
            rejectEnvironment(id);
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            stored.forEach(item -> item.defaultSelected = false);
            row.defaultSelected = true;
            write(stored);
            return snapshot(row).view();
        }
    }

    public ModelConnectionSnapshot require(UUID id) {
        synchronized (lock) {
            if (ENVIRONMENT_ID.equals(id)) {
                var environment = environment();
                if (environment == null) throw status(HttpStatus.NOT_FOUND, "UNKNOWN_CONNECTION");
                return environment;
            }
            return snapshot(find(new ArrayList<>(read()), id));
        }
    }

    public org.springframework.ai.chat.client.ChatClient chatClient(ModelConnectionSnapshot snapshot) {
        return chatClients.computeIfAbsent(cacheKey(snapshot), key -> clients.conversational(snapshot));
    }

    public org.springframework.ai.chat.client.ChatClient completionClient(ModelConnectionSnapshot snapshot) {
        return completionClients.computeIfAbsent(cacheKey(snapshot), key -> clients.completion(snapshot));
    }

    public boolean anyStored() {
        synchronized (lock) {
            return !read().isEmpty();
        }
    }

    private static String cacheKey(ModelConnectionSnapshot snapshot) {
        return snapshot.id + ":" + snapshot.revision;
    }

    private ModelConnectionSnapshot effective(List<Row> stored, ModelConnectionSnapshot environment) {
        if (stored.isEmpty()) return environment != null && environment.usable() ? environment : null;
        return stored.stream().filter(row -> row.defaultSelected && row.enabled).map(this::snapshot)
                .filter(ModelConnectionSnapshot::usable).findFirst().orElse(null);
    }

    private ModelConnectionSnapshot environment() {
        if (!"openai".equals(environmentProvider) || environmentSecret.isBlank() || environmentModel.isBlank()
                || !EndpointPolicy.permits(environmentBaseUrl, true)) return null;
        return snapshot(ENVIRONMENT_ID, "环境默认", KIND, true, environmentBaseUrl, environmentModel, environmentSecret,
                1, true, !anyStoredUnsafe(), fingerprint(environmentSecret));
    }

    private boolean anyStoredUnsafe() {
        return !read().isEmpty();
    }

    private ModelConnectionSnapshot snapshot(Row row) {
        return snapshot(row.id, row.name, row.kind, row.enabled, row.baseUrl, row.model, row.secret, row.revision,
                false, row.defaultSelected, fingerprint(row.secret));
    }

    private ModelConnectionSnapshot snapshot(UUID id, String name, String kind, boolean enabled, String baseUrl,
            String model, String secret, long revision, boolean environment, boolean defaultSelected, String fingerprint) {
        var configuration = AiConnectionStatus.revision("openai", model, baseUrl, rootConfigured, fingerprint);
        return new ModelConnectionSnapshot(id, name, kind, enabled, baseUrl, model, secret, revision, environment,
                defaultSelected, configuration);
    }

    private void fill(Row row, String name, String baseUrl, String model, String secret, boolean secretRequired) {
        row.name = requireText(name, 80);
        row.kind = KIND;
        row.baseUrl = normalizeUrl(baseUrl);
        row.model = requireText(model, 120);
        row.secret = secretRequired ? checkedSecret(secret) : checkedSecret(secret);
    }

    private static String normalizeUrl(String baseUrl) {
        var value = requireText(baseUrl, 300);
        if (!EndpointPolicy.permits(value, true)) throw status(HttpStatus.BAD_REQUEST, "ENDPOINT_REJECTED");
        return value;
    }

    private static String checkedSecret(String secret) {
        if (secret == null || secret.isBlank()) throw status(HttpStatus.BAD_REQUEST, "SECRET_REQUIRED");
        if (secret.length() > 400 || secret.indexOf('\n') >= 0 || secret.indexOf('\r') >= 0)
            throw status(HttpStatus.BAD_REQUEST, "SECRET_REJECTED");
        return secret;
    }

    private static String requireText(String value, int limit) {
        var text = value == null ? "" : value.trim();
        if (text.isEmpty() || text.length() > limit) throw status(HttpStatus.BAD_REQUEST, "INVALID_CONNECTION");
        return text;
    }

    private static void rejectEnvironment(UUID id) {
        if (ENVIRONMENT_ID.equals(id)) throw status(HttpStatus.CONFLICT, "ENVIRONMENT_DEFAULT_READONLY");
    }

    private Row find(List<Row> stored, UUID id) {
        return stored.stream().filter(row -> row.id.equals(id)).findFirst()
                .orElseThrow(() -> status(HttpStatus.NOT_FOUND, "UNKNOWN_CONNECTION"));
    }

    private List<Row> read() {
        if (!Files.isRegularFile(file)) return List.of();
        try {
            var parsed = JSON.readValue(Files.readString(file), FileModel.class);
            if (parsed == null || parsed.connections == null) return List.of();
            return parsed.connections.stream().filter(row -> row != null && row.id != null && KIND.equals(row.kind)).toList();
        } catch (RuntimeException | IOException failure) {
            throw new IllegalStateException("CONNECTION_STORE_UNREADABLE");
        }
    }

    private void write(List<Row> stored) {
        var body = new FileModel();
        body.connections = stored;
        try {
            var parent = file.getParent();
            if (parent != null) Files.createDirectories(parent);
            var temp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(temp, JSON.writeValueAsString(body), StandardCharsets.UTF_8);
            try {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException unsupported) {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException failure) {
            throw new IllegalStateException("CONNECTION_STORE_FAILED");
        }
    }

    static String fingerprint(String secret) {
        if (secret == null || secret.isBlank()) return "absent";
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static ResponseStatusException status(HttpStatus status, String code) {
        return new ResponseStatusException(status, code);
    }

    public record Listing(List<ModelConnectionView> items, UUID effectiveDefaultId) {}

    static final class FileModel {
        public List<Row> connections = List.of();
    }

    static final class Row {
        public UUID id;
        public String name;
        public String kind;
        public boolean enabled;
        public String baseUrl;
        public String model;
        public String secret;
        public long revision;
        public boolean defaultSelected;

        @Override
        public String toString() {
            return "connection " + id;
        }
    }
}
