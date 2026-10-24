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
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** HTTP-facing chat boundary. Request bodies cannot choose identity, workspace or tool grants. */
@Component
public class AiChatApplication {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> MESSAGE_FIELDS = Set.of("message", "toolMode");
    private final AiConnectionStatus status;
    private final AiConversationRegistry conversations;
    private final EngineeringChatService chat;
    private final Path workspace;

    public AiChatApplication(AiConnectionStatus status, AiConversationRegistry conversations, EngineeringChatService chat,
            Path workspace) {
        this.status = status;
        this.conversations = conversations;
        this.chat = chat;
        this.workspace = workspace;
    }

    public AiConnectionStatus.Snapshot status() {
        return status.read();
    }

    public AiConversationResponse open(String json) {
        objectBody(json, Set.of());
        var session = conversations.open(workspace, status.workspaceLabel(workspace));
        return new AiConversationResponse(session.id, session.workspaceLabel, AiConversationRegistry.MEMORY_NOTE);
    }

    public AiMessageResponse send(UUID id, String json) {
        var body = objectBody(json, MESSAGE_FIELDS);
        if (!(body.get("message") instanceof String message) || message.isBlank() || message.length() > 32000
                || !(body.get("toolMode") instanceof String toolMode))
            throw invalid();
        boolean git = switch (toolMode) {
            case "none" -> false;
            case "git_status" -> true;
            default -> throw invalid();
        };
        var snapshot = status.read();
        if ("disabled".equals(snapshot.state()) || "not_configured".equals(snapshot.state()))
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI_NOT_CONFIGURED");
        if (git && !status.gitStatusAvailable())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "TOOL_NOT_GRANTED");
        var session = conversations.require(id);
        if (!session.workspace.equals(workspace))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "WORKSPACE_MISMATCH");
        var outcome = conversations.exclusive(id, () -> chat.chat(new EngineeringChatService.Request(
                AiConversationRegistry.PRINCIPAL, id, workspace, git, message), git));
        if (!"AI_NOT_CONFIGURED".equals(outcome.error())) status.observe(outcome.error());
        return message(outcome);
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
