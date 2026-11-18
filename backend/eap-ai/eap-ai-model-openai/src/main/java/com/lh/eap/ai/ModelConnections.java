package com.lh.eap.ai;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Set;
import org.springframework.ai.chat.client.ChatClient;
import com.lh.eap.error.SecurityErrors;
import com.lh.eap.error.ChatGptAuthErrors;
import com.lh.eap.error.ModelErrors;

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
 * Credentials, discovered models and explicit model selection have separate lifecycles.
 */
@Component
public final class ModelConnections {
    public static final String KIND = "openai-compatible";
    public static final String CHATGPT_KIND = ModelProtocols.CHATGPT_KIND;
    @Autowired(required = false)
    private ChatGptOAuthProtocol oauthProtocol;
    private static final int LIMIT = 16;
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Path file;
    private final boolean rootConfigured;
    private final ModelClientSource clients;
    private final ConcurrentHashMap<String, ChatClient> chatClients = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, ChatClient> completionClients = new ConcurrentHashMap<>();
    private final Object lock = new Object();

    @Autowired
    public ModelConnections(@Value("${eap.ai.connection-store:.eap/model-connections.json}") String file,
            RuntimeWorkspace runtime, ModelClientSource clients) {
        this(Path.of(file), runtime.root().allowed(), clients);
    }

    public ModelConnections(Path file, boolean rootConfigured, ModelClientSource clients) {
        this.file = file;
        this.rootConfigured = rootConfigured;
        this.clients = clients;
    }

    public Listing list() {
        synchronized (lock) {
            var stored = read();
            var items = new ArrayList<ModelConnectionView>();
            stored.stream().sorted(Comparator.comparing(row -> row.name)).map(this::view).forEach(items::add);
            var effective = effective(stored);
            return new Listing(List.copyOf(items), effective == null ? null : effective.id);
        }
    }

    public ModelConnectionSnapshot effectiveDefault() {
        synchronized (lock) {
            var stored = read();
            return effective(stored);
        }
    }

    public ModelConnectionView create(String name, String baseUrl, String secret, boolean enabled,
            boolean makeDefault) {
        return create(name, baseUrl, secret, enabled, makeDefault, null);
    }

    public ModelConnectionView create(String name, String baseUrl, String secret, boolean enabled,
            boolean makeDefault, String wireApi) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            if (stored.size() >= LIMIT) throw status(HttpStatus.CONFLICT, ModelErrors.CONNECTION_LIMIT.code());
            var row = new Row();
            row.id = UUID.randomUUID();
            row.kind = KIND;
            row.wireApi = checkedWireApi(wireApi);
            row.revision = 1;
            fill(row, name, baseUrl, secret);
            row.enabled = enabled;
            row.defaultSelected = makeDefault;
            if (row.defaultSelected) stored.forEach(item -> item.defaultSelected = false);
            stored.add(row);
            write(stored);
            return view(row);
        }
    }

    public ModelConnectionView update(UUID id, String name, String baseUrl, String secret, boolean enabled,
            boolean makeDefault) {
        return update(id, name, baseUrl, secret, enabled, makeDefault, null);
    }

    public ModelConnectionView update(UUID id, String name, String baseUrl, String secret, boolean enabled,
            boolean makeDefault, String wireApi) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            if (!KIND.equals(row.kind)) throw status(HttpStatus.BAD_REQUEST, ModelErrors.CONNECTION_TYPE_MISMATCH.code());
            var nextSecret = secret == null || secret.isBlank() ? row.secret : secret;
            var nextWireApi = checkedWireApi(wireApi == null ? row.wireApi : wireApi);
            boolean protocolChanged = !checkedWireApi(row.wireApi).equals(nextWireApi);
            boolean material = !row.baseUrl.equals(normalizeUrl(baseUrl))
                    || !row.secret.equals(checkedSecret(nextSecret));
            fill(row, name, baseUrl, nextSecret);
            row.wireApi = nextWireApi;
            if (material) { row.models = List.of(); row.allowedModels = List.of(); row.defaultModel = ""; row.discoveredAt = ""; row.discoveryError = ""; }
            row.enabled = enabled;
            if (material || protocolChanged) row.revision++;
            row.defaultSelected = makeDefault;
            if (makeDefault) {
                stored.forEach(item -> item.defaultSelected = false);
                row.defaultSelected = true;
            }
            write(stored);
            return view(row);
        }
    }

    public ModelConnectionView setEnabled(UUID id, boolean enabled) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            row.enabled = enabled;
            write(stored);
            return view(row);
        }
    }

    public ModelConnectionView setDefault(UUID id) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            stored.forEach(item -> item.defaultSelected = false);
            row.defaultSelected = true;
            write(stored);
            return view(row);
        }
    }

    public ModelConnectionSnapshot require(UUID id) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            return authorizedSnapshot(row, stored);
        }
    }

    /** Validate/refresh credentials against the same loaded document as model authorization. Caller holds lock. */
    private ModelConnectionSnapshot authorizedSnapshot(Row row, List<Row> stored) {
        if (CHATGPT_KIND.equals(row.kind) && row.enabled) {
            if (row.oauth == null || !row.oauth.planGranted()) throw status(HttpStatus.FORBIDDEN, ChatGptAuthErrors.CHATGPT_PLAN_PERMISSION_REQUIRED.code());
            if (row.oauth.expiresAt().isBefore(Instant.now().plusSeconds(60))) {
                if (oauthProtocol == null) throw status(HttpStatus.UNAUTHORIZED, ChatGptAuthErrors.CHATGPT_REAUTH_REQUIRED.code());
                try {
                    row.oauth = oauthProtocol.refresh(row.oauth); write(stored);
                    if (!row.oauth.planGranted()) throw status(HttpStatus.FORBIDDEN, ChatGptAuthErrors.CHATGPT_PLAN_PERMISSION_REQUIRED.code());
                }
                catch (ChatGptOAuthProtocol.AuthFailure failure) { throw status(HttpStatus.UNAUTHORIZED, failure.getMessage()); }
            }
        }
        return snapshot(row);
    }

    ChatGptCredentials oauthCredentials(UUID id) {
        synchronized (lock) {
            var row = find(read(), id);
            if (!CHATGPT_KIND.equals(row.kind)) throw status(HttpStatus.BAD_REQUEST, ModelErrors.CONNECTION_TYPE_MISMATCH.code());
            return row.oauth;
        }
    }

    void registerOAuth(UUID id, String clientId) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = stored.stream().filter(item -> item.id.equals(id)).findFirst().orElse(null);
            if (row != null) {
                if (!CHATGPT_KIND.equals(row.kind) || row.oauth == null || !clientId.equals(row.oauth.clientId()))
                    throw status(HttpStatus.CONFLICT, ChatGptAuthErrors.CHATGPT_ACCOUNT_MISMATCH.code());
                return;
            }
            if (stored.size() >= LIMIT) throw status(HttpStatus.CONFLICT, ModelErrors.CONNECTION_LIMIT.code());
            row = new Row(); row.id = id; row.kind = CHATGPT_KIND; row.name = "ChatGPT";
            row.baseUrl = "https://api.openai.com/v1"; row.secret = ""; row.revision = 1; row.enabled = true;
            row.oauth = new ChatGptCredentials(clientId, "", "", "", "", "", Instant.EPOCH, Set.of());
            stored.add(row); write(stored);
        }
    }

    void completeOAuth(UUID id, ChatGptCredentials credentials) {
        synchronized (lock) {
            var stored = new ArrayList<>(read()); var row = find(stored, id);
            if (!CHATGPT_KIND.equals(row.kind) || row.oauth == null || !row.oauth.clientId().equals(credentials.clientId())
                    || (!row.oauth.subject().isBlank() && !row.oauth.subject().equals(credentials.subject())))
                throw status(HttpStatus.CONFLICT, ChatGptAuthErrors.CHATGPT_ACCOUNT_MISMATCH.code());
            if (!row.oauth.subject().isBlank()) row.revision++;
            row.oauth = credentials;
            row.name = "ChatGPT" + (credentials.email() == null || credentials.email().isBlank() ? "" : " · " + credentials.email());
            row.enabled = true; write(stored);
        }
    }

    public void disconnectOAuth(UUID id) {
        synchronized (lock) {
            var stored = new ArrayList<>(read()); var row = find(stored, id);
            if (!CHATGPT_KIND.equals(row.kind) || row.oauth == null) throw status(HttpStatus.BAD_REQUEST, ModelErrors.CONNECTION_TYPE_MISMATCH.code());
            var previous = row.oauth;
            row.oauth = new ChatGptCredentials(previous.clientId(), previous.subject(), previous.email(), "", "", "", Instant.EPOCH, Set.of());
            row.enabled = false; row.revision++; write(stored);
        }
    }

    synchronized String oauthHostId() {
        var hostFile = file.resolveSibling(file.getFileName() + ".host");
        try {
            if (Files.isRegularFile(hostFile)) {
                var host = Files.readString(hostFile).trim();
                if (!host.matches("urn:uuid:[0-9a-f-]{36}")) throw new IOException();
                return host;
            }
            var host = "urn:uuid:" + UUID.randomUUID();
            ProtectedLocalFile.write(hostFile, host); return host;
        } catch (IOException failure) { throw new IllegalStateException(ChatGptAuthErrors.CHATGPT_HOST_STORE_FAILED.code()); }
    }

    /** Never cached: tool iteration can hold originals only within this request. */
    public ChatClient transientChatClient(ModelConnectionSnapshot snapshot) {
        return clients.transientConversation(snapshot);
    }

    public ChatClient chatClient(ModelConnectionSnapshot snapshot) {
        var selected = CHATGPT_KIND.equals(snapshot.kind) ? requireModel(snapshot.id, snapshot.model) : snapshot;
        return chatClients.computeIfAbsent(cacheKey(selected), key -> clients.conversational(selected));
    }

    public ChatClient completionClient(ModelConnectionSnapshot snapshot) {
        var selected = CHATGPT_KIND.equals(snapshot.kind) ? requireModel(snapshot.id, snapshot.model) : snapshot;
        return completionClients.computeIfAbsent(cacheKey(selected), key -> clients.completion(selected));
    }

    public boolean anyStored() {
        synchronized (lock) {
            return !read().isEmpty();
        }
    }

    private static String cacheKey(ModelConnectionSnapshot snapshot) {
        return snapshot.id + ":" + snapshot.revision + ":" + snapshot.model + ":" + snapshot.configurationRevision;
    }

    public ModelConnectionSnapshot requireModel(UUID id, String model) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            var selected = requireText(model, 120);
            if (row.allowedModels == null || !row.allowedModels.contains(selected))
                throw status(HttpStatus.FORBIDDEN, ModelErrors.MODEL_NOT_ALLOWED.code());
            return authorizedSnapshot(row, stored).withModel(selected);
        }
    }

    /** Capability is an explicit operator declaration, never inferred from a model name or discovery. */
    public boolean supportsImageInput(UUID id, String model) {
        synchronized (lock) {
            var row = find(read(), id);
            return !CHATGPT_KIND.equals(row.kind) && models(row).stream()
                    .anyMatch(option -> option.id().equals(model) && option.supportsImageInput());
        }
    }

    public boolean supportsReasoning(UUID id, String model, String effort) {
        synchronized (lock) {
            if ("default".equals(effort)) return true;
            return models(find(read(), id)).stream().anyMatch(option -> option.id().equals(model)
                    && option.reasoningEfforts().contains(effort));
        }
    }

    public ModelConnectionView configureModels(UUID id, List<ModelOption> options, List<String> allowed, String defaultModel) {
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            if (options == null || options.isEmpty() || options.size() > 1024 || allowed == null || allowed.isEmpty()
                    || allowed.size() > 128 || allowed.stream().distinct().count() != allowed.size())
                throw status(HttpStatus.BAD_REQUEST, ModelErrors.INVALID_MODEL_SELECTION.code());
            if (CHATGPT_KIND.equals(row.kind) && options.stream().anyMatch(option -> option == null || models(row).stream().noneMatch(known -> known.id().equals(option.id()))))
                throw status(HttpStatus.BAD_REQUEST, ModelErrors.MODEL_NOT_IN_ACCOUNT_CATALOG.code());
            var ids = new HashSet<String>();
            for (var option : options) {
                if (option == null || !ids.add(requireText(option.id(), 120)) || !option.id().equals(option.id().trim())
                        || option.id().chars().anyMatch(Character::isISOControl)
                        || (CHATGPT_KIND.equals(row.kind) && option.supportsImageInput())
                        || option.reasoningEfforts().size() > 3
                        || !Set.of("low", "medium", "high").containsAll(option.reasoningEfforts()))
                    throw status(HttpStatus.BAD_REQUEST, ModelErrors.INVALID_MODEL_SELECTION.code());
            }
            if (!ids.containsAll(allowed) || !allowed.contains(defaultModel))
                throw status(HttpStatus.BAD_REQUEST, ModelErrors.INVALID_MODEL_SELECTION.code());
            row.models = List.copyOf(options);
            row.allowedModels = List.copyOf(allowed);
            // Default model changes affect future sessions and SQL; existing chat bindings keep their selected model.
            row.defaultModel = defaultModel;
            write(stored);
            return view(row);
        }
    }

    public ModelConnectionView refreshModels(UUID id, ModelDiscovery discovery) {
        var requested = require(id);
        if (!requested.enabled) throw status(HttpStatus.CONFLICT, ModelErrors.CONNECTION_DISABLED.code());
        List<String> discovered = null;
        String error = "";
        try { discovered = discovery.fetch(requested); }
        catch (ModelDiscovery.DiscoveryFailure failure) { error = failure.getMessage(); }
        synchronized (lock) {
            var stored = new ArrayList<>(read());
            var row = find(stored, id);
            if (row.revision != requested.revision) throw status(HttpStatus.CONFLICT, ModelErrors.CONNECTION_CHANGED_DURING_DISCOVERY.code());
            if (discovered != null) {
                var merged = new LinkedHashMap<String, ModelOption>();
                models(row).forEach(option -> merged.put(option.id(), option));
                discovered.forEach(model -> merged.putIfAbsent(model, new ModelOption(model, List.of())));
                if (merged.size() > 1024) throw status(HttpStatus.CONFLICT, ModelErrors.MODEL_CATALOG_LIMIT.code());
                row.models = List.copyOf(merged.values());
                row.discoveredAt = Instant.now().toString();
            }
            row.discoveryError = error;
            write(stored);
            return view(row);
        }
    }

    private List<ModelOption> models(Row row) {
        return row.models == null ? List.of() : row.models;
    }

    private ModelConnectionView view(Row row) {
        var basic = snapshot(row).view();
        return new ModelConnectionView(basic.id(), basic.name(), basic.kind(), basic.enabled(), basic.baseUrl(), basic.defaultModel(),
                basic.secretPresent(), basic.revision(), basic.defaultSelected(), basic.configurationRevision(),
                models(row), row.allowedModels == null ? List.of() : row.allowedModels,
                row.discoveredAt == null ? "" : row.discoveredAt, row.discoveryError == null ? "" : row.discoveryError, basic.wireApi());
    }

    private ModelConnectionSnapshot effective(List<Row> stored) {
        if (stored.isEmpty()) return null;
        return stored.stream().filter(row -> row.defaultSelected && row.enabled).map(this::snapshot)
                .filter(ModelConnectionSnapshot::usable).findFirst().orElse(null);
    }

    private ModelConnectionSnapshot snapshot(Row row) {
        var credential = CHATGPT_KIND.equals(row.kind) ? row.oauth != null && row.oauth.planGranted() ? row.oauth.accessToken() : "" : row.secret;
        return snapshot(row.id, row.name, row.kind, row.enabled, row.baseUrl, row.defaultModel, credential, row.revision,
                row.defaultSelected, fingerprint(credential), CHATGPT_KIND.equals(row.kind) ? "responses" : checkedWireApi(row.wireApi));
    }

    private ModelConnectionSnapshot snapshot(UUID id, String name, String kind, boolean enabled, String baseUrl,
            String model, String secret, long revision, boolean defaultSelected, String fingerprint, String wireApi) {
        var configuration = ConnectionIdentity.revision("openai:" + wireApi, model, baseUrl, rootConfigured, fingerprint);
        return new ModelConnectionSnapshot(id, name, kind, enabled, baseUrl, model, secret, revision,
                defaultSelected, configuration, wireApi);
    }

    static String checkedWireApi(String value) { return ModelProtocols.checkedWireApi(value); }

    private void fill(Row row, String name, String baseUrl, String secret) {
        row.name = requireText(name, 80);
        row.kind = KIND;
        row.baseUrl = normalizeUrl(baseUrl);
        if (row.defaultModel == null) row.defaultModel = "";
        row.secret = checkedSecret(secret);
    }

    private static String normalizeUrl(String baseUrl) {
        var value = requireText(baseUrl, 300);
        if (!EndpointPolicy.permits(value, true)) throw status(HttpStatus.BAD_REQUEST, SecurityErrors.ENDPOINT_REJECTED.code());
        return value;
    }

    private static String checkedSecret(String secret) {
        if (secret == null || secret.isBlank()) throw status(HttpStatus.BAD_REQUEST, SecurityErrors.SECRET_REQUIRED.code());
        if (secret.length() > 400 || secret.indexOf('\n') >= 0 || secret.indexOf('\r') >= 0)
            throw status(HttpStatus.BAD_REQUEST, SecurityErrors.SECRET_REJECTED.code());
        return secret;
    }

    private static String requireText(String value, int limit) {
        var text = value == null ? "" : value.trim();
        if (text.isEmpty() || text.length() > limit) throw status(HttpStatus.BAD_REQUEST, ModelErrors.INVALID_CONNECTION.code());
        return text;
    }

    private Row find(List<Row> stored, UUID id) {
        return stored.stream().filter(row -> row.id.equals(id)).findFirst()
                .orElseThrow(() -> status(HttpStatus.NOT_FOUND, ModelErrors.UNKNOWN_CONNECTION.code()));
    }

    private List<Row> read() {
        if (!Files.isRegularFile(file)) return List.of();
        try {
            var parsed = JSON.readValue(Files.readString(file), FileModel.class);
            if (parsed == null || parsed.connections == null) return List.of();
            return parsed.connections.stream().filter(row -> row != null && row.id != null && (KIND.equals(row.kind) || CHATGPT_KIND.equals(row.kind))).toList();
        } catch (RuntimeException | IOException failure) {
            throw new IllegalStateException(ModelErrors.CONNECTION_STORE_UNREADABLE.code());
        }
    }

    private void write(List<Row> stored) {
        var body = new FileModel();
        body.connections = stored;
        try {
            ProtectedLocalFile.write(file, JSON.writeValueAsString(body));
        } catch (IOException failure) {
            throw new IllegalStateException(ModelErrors.CONNECTION_STORE_FAILED.code());
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

    @JsonIgnoreProperties(ignoreUnknown = true)
    static final class Row {
        public UUID id;
        public String name;
        public String kind;
        public String wireApi;
        public boolean enabled;
        public String baseUrl;
        public String defaultModel = "";
        public String secret;
        public long revision;
        public boolean defaultSelected;
        public List<ModelOption> models;
        public List<String> allowedModels;
        public String discoveredAt;
        public String discoveryError;
        public ChatGptCredentials oauth;

        @Override
        public String toString() {
            return "connection " + id;
        }
    }
}
