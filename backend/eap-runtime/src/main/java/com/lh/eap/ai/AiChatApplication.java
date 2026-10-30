package com.lh.eap.ai;

import com.lh.eap.api.CliExecution;
import com.lh.eap.web.dto.AiConversationResponse;
import com.lh.eap.web.dto.AiMessageResponse;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** HTTP-facing chat boundary. Request bodies cannot choose identity, workspace or tool grants. */
@Component
public class AiChatApplication {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> MESSAGE_FIELDS = Set.of("message", "toolMode", "context");
    @Autowired(required = false)
    private com.lh.eap.application.service.PrototypeVersionService prototypes;
    @Autowired(required = false)
    private CodeChangeService codeChanges;
    @Autowired(required = false)
    private ModelDiscovery discovery;
    private final AiConnectionStatus status;
    private final AiConversationRegistry conversations;
    private final EngineeringChatService chat;
    private final Path workspace;
    private final ModelConnections connections;

    public AiChatApplication(AiConnectionStatus status, AiConversationRegistry conversations, EngineeringChatService chat,
            Path workspace) {
        this(status, conversations, chat, workspace, null);
    }

    @Autowired
    public AiChatApplication(AiConnectionStatus status, AiConversationRegistry conversations, EngineeringChatService chat,
            Path workspace, ModelConnections connections) {
        this.status = status;
        this.conversations = conversations;
        this.chat = chat;
        this.workspace = workspace;
        this.connections = connections;
    }

    public AiConnectionStatus.Snapshot status() {
        return status.read();
    }

    public CodeChangeService.Baseline baseline(String path) {
        if (codeChanges == null) throw unavailable();
        return codeChanges.inspectBaseline(path);
    }

    public CodeChangeService.SourceExcerpt source(String path) {
        if (codeChanges == null) throw unavailable();
        return codeChanges.inspectSource(path);
    }

    public CodeChangeService.DirtySummary dirty() {
        if (codeChanges == null) throw unavailable();
        return codeChanges.inspectDirty();
    }

    public CodeChangeService.VerificationProbe verificationProbe() {
        if (codeChanges == null) throw unavailable();
        return codeChanges.probeVerification();
    }

    public AiConversationResponse open(String json) {
        objectBody(json, Set.of());
        var session = conversations.open(workspace, AiConnectionStatus.workspaceLabel(workspace));
        if (connections != null) {
            var selected = connections.effectiveDefault();
            if (selected != null) conversations.bind(session.id, binding(selected), false);
        }
        return conversation(session.id);
    }

    public void deleteConversation(UUID id) { conversations.delete(id); }

    public ModelConnections.Listing connections() {
        if (connections == null) return new ModelConnections.Listing(java.util.List.of(), null);
        return connections.list();
    }

    public ModelConnectionView saveConnection(UUID id, String json) {
        if (connections == null) throw unavailable();
        var body = objectBody(json, id == null
                ? Set.of("name", "baseUrl", "secret", "enabled", "defaultSelected")
                : Set.of("name", "baseUrl", "secret", "enabled", "defaultSelected"));
        var name = text(body, "name");
        var baseUrl = text(body, "baseUrl");
        var secret = body.get("secret") instanceof String value ? value : "";
        boolean enabled = bool(body, "enabled", true);
        boolean makeDefault = bool(body, "defaultSelected", false);
        var saved = id == null
                ? connections.create(name, baseUrl, secret, enabled, makeDefault)
                : connections.update(id, name, baseUrl, secret, enabled, makeDefault);
        return saved;
    }

    public ModelConnectionView setConnectionEnabled(UUID id, String json) {
        if (connections == null) throw unavailable();
        var body = objectBody(json, Set.of("enabled"));
        return connections.setEnabled(id, bool(body, "enabled", false));
    }

    public ModelConnectionView setDefaultConnection(UUID id) {
        if (connections == null) throw unavailable();
        return connections.setDefault(id);
    }

    public ModelConnectionView refreshModels(UUID id) {
        if (connections == null || discovery == null) throw unavailable();
        return connections.refreshModels(id, discovery);
    }

    public ModelConnectionView configureModels(UUID id, String json) {
        if (connections == null) throw unavailable();
        var body = objectBody(json, Set.of("models", "allowedModels", "defaultModel"));
        if (!(body.get("models") instanceof java.util.List<?> entries)
                || !(body.get("allowedModels") instanceof java.util.List<?> allowed)
                || allowed.stream().anyMatch(value -> !(value instanceof String))) throw invalid();
        var options = new java.util.ArrayList<ModelOption>();
        for (var entry : entries) {
            if (!(entry instanceof Map<?, ?> item) || !item.keySet().equals(Set.of("id", "reasoningEfforts"))
                    || !(item.get("id") instanceof String model)
                    || !(item.get("reasoningEfforts") instanceof java.util.List<?> efforts)
                    || efforts.stream().anyMatch(value -> !(value instanceof String))) throw invalid();
            options.add(new ModelOption(model, efforts.stream().map(String.class::cast).toList()));
        }
        return connections.configureModels(id, options, allowed.stream().map(String.class::cast).toList(), text(body, "defaultModel"));
    }

    public com.lh.eap.web.dto.AiConnectionAssignment assign(UUID id, String json) {
        if (connections == null) throw unavailable();
        var body = objectBody(json, Set.of("connectionId", "model", "confirmTargetChange"));
        if (!(body.get("connectionId") instanceof String raw)) throw invalid();
        final UUID connectionId;
        try {
            connectionId = UUID.fromString(raw);
        } catch (IllegalArgumentException invalid) {
            throw invalid();
        }
        boolean confirm = Boolean.TRUE.equals(body.get("confirmTargetChange"));
        var target = connections.requireModel(connectionId, text(body, "model"));
        if (!target.usable()) throw unavailable();
        var current = conversations.binding(id);
        boolean changed = current == null || !current.connectionId.equals(target.id) || current.revision != target.revision
                || !current.model.equals(target.model);
        if (changed && current != null && !confirm)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "TARGET_CHANGE_CONFIRMATION_REQUIRED");
        conversations.bind(id, binding(target), changed && current != null);
        var bound = conversations.binding(id);
        return new com.lh.eap.web.dto.AiConnectionAssignment(id, bound.connectionId, bound.name, bound.model,
                bound.endpoint, bound.revision, changed && current != null);
    }

    public AiMessageResponse send(UUID id, String json) {
        var body = objectBody(json, MESSAGE_FIELDS);
        var context = TaskContext.parse(body.get("context"));
        if (!(body.get("message") instanceof String message) || message.isBlank() || message.length() > 32000
                || !(body.get("toolMode") instanceof String toolMode))
            throw invalid();
        boolean git = switch (toolMode) {
            case "none" -> false;
            case "git_status" -> true;
            default -> throw invalid();
        };
        if (connections == null) {
            var snapshot = status.read();
            if ("disabled".equals(snapshot.state()) || "not_configured".equals(snapshot.state()))
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED");
        }
        if (git && context.mode().equals("chat") && !status.gitStatusAvailable())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "TOOL_NOT_GRANTED");
        var session = conversations.require(id);
        if (!session.workspace.equals(workspace))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "WORKSPACE_MISMATCH");
        String prototype = "";
        if (!context.prototypeVersionId().isBlank()) {
            if (prototypes == null) throw unavailable();
            final UUID versionId;
            try { versionId = UUID.fromString(context.prototypeVersionId()); } catch (IllegalArgumentException invalid) { throw invalid(); }
            prototype = JSON.writeValueAsString(prototypes.find(versionId));
        }
        String draft = context.userMessage(message, prototype);
        if (context.mode().equals("code") && !context.targetPath().isBlank() && codeChanges != null) {
            draft = TaskContext.withWorkspaceSource(draft, codeChanges.inspectSource(context.targetPath()));
        }
        if (draft.length() > 64000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "TASK_CONTEXT_TOO_LARGE");
        final String composed = draft;
        var outcome = conversations.exclusive(id, () -> {
            var current = conversations.binding(id);
            var selectedClient = current == null ? null : current.client;
            var selectedRevision = current == null ? null : current.configurationRevision;
            if (connections != null) {
                if (current == null) throw unavailable();
                var live = connections.require(current.connectionId);
                if (live.revision != current.revision) throw new ResponseStatusException(HttpStatus.CONFLICT, "TARGET_CHANGE_CONFIRMATION_REQUIRED");
                live = connections.requireModel(current.connectionId, current.model);
                if (!live.usable()) throw unavailable();
                if (git && ModelConnections.CHATGPT_KIND.equals(live.kind))
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "CHATGPT_PLAN_TOOLS_UNAVAILABLE");
                selectedClient = connections.chatClient(live);
                selectedRevision = live.configurationRevision;
                if (!connections.supportsReasoning(current.connectionId, current.model, context.reasoning()))
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "REASONING_OPTION_NOT_SUPPORTED");
            }
            var result = chat.chat(new EngineeringChatService.Request(
                    AiConversationRegistry.PRINCIPAL, id, workspace, git, composed), git && context.mode().equals("chat"),
                    selectedClient, context);
            if (current != null) status.observeRevision(selectedRevision, result.error());
            else if (!"AI_NOT_CONFIGURED".equals(result.error())) status.observe(result.error());
            return result;
        });
        var response = message(outcome);
        if (context.mode().equals("code") && outcome.error().isEmpty() && codeChanges != null) {
            var proposal = codeChanges.propose(id, outcome.answer(), context.approval().equals("review"),
                    context.targetPath());
            return new AiMessageResponse(response.executionId(), proposal.summary(), response.error(), response.status(),
                    response.approval(), response.verification(), response.toolEvents(), response.artifactError(), response.artifacts(), proposal);
        }
        return response;
    }

    public CodeChangeService.Applied apply(UUID conversation, UUID proposal, String json) {
        var body = objectBody(json, Set.of("confirmed"));
        if (codeChanges == null) throw unavailable();
        return conversations.exclusive(conversation, () -> codeChanges.apply(conversation, proposal, Boolean.TRUE.equals(body.get("confirmed"))));
    }

    public AiConversationResponse conversation(UUID id) {
        var bound = conversations.binding(id);
        return new AiConversationResponse(id, conversations.require(id).workspaceLabel, AiConversationRegistry.MEMORY_NOTE,
                bound == null ? null : bound.connectionId, bound == null ? null : bound.name,
                bound == null ? null : bound.revision, bound == null ? null : bound.model);
    }

    private AiConversationRegistry.Binding binding(ModelConnectionSnapshot snapshot) {
        return new AiConversationRegistry.Binding(snapshot.id, snapshot.revision, snapshot.name, snapshot.model,
                AiConnectionStatus.endpointIdentity(snapshot.baseUrl), snapshot.configurationRevision,
                connections.chatClient(snapshot));
    }

    private static String text(java.util.Map<String, Object> body, String name) {
        if (!(body.get(name) instanceof String value)) throw invalid();
        return value;
    }

    private static boolean bool(java.util.Map<String, Object> body, String name, boolean fallback) {
        var value = body.get(name);
        if (value == null) return fallback;
        if (value instanceof Boolean flag) return flag;
        throw invalid();
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED");
    }

    private static AiMessageResponse message(EngineeringChatService.Outcome outcome) {
        CliExecution.Result execution = outcome.execution();
        var events = execution.trace().stdoutLines().stream()
                .map(line -> new AiMessageResponse.AiToolEvent(line.sequence(), line.text())).toList();
        var artifacts = execution.artifacts().stream()
                .map(artifact -> new AiMessageResponse.AiArtifactSummary(artifact.artifactId(), artifact.executionId(),
                        artifact.kind(), artifact.sizeBytes(), artifact.sha256())).toList();
        return new AiMessageResponse(outcome.executionId(), outcome.answer(), outcome.error(),
                execution.status().name(), execution.approval().name(), execution.verification().name(),
                events, execution.artifactError(), artifacts);
    }

    static Map<String, Object> objectBody(String json, Set<String> allowed) {
        if (json == null || json.isBlank()) {
            if (!allowed.isEmpty()) throw invalid();
            return Map.of();
        }
        final Object parsed;
        try {
            parsed = JSON.readValue(json, Object.class);
        } catch (RuntimeException invalid) {
            throw invalid();
        }
        if (!(parsed instanceof Map<?, ?> raw)) throw invalid();
        var body = new LinkedHashMap<String, Object>();
        for (var entry : raw.entrySet()) {
            if (!(entry.getKey() instanceof String name) || !allowed.contains(name)) throw invalid();
            body.put(name, entry.getValue());
        }
        return body;
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_CHAT_REQUEST");
    }
}
