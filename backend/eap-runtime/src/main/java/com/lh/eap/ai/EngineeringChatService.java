package com.lh.eap.ai;

import com.lh.eap.api.CliExecution;
import com.lh.eap.application.service.ExecutionArtifactStore;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.tool.annotation.Tool;

/** Application service. Callers supply authenticated, server-owned scope; not an HTTP request DTO. */
public final class EngineeringChatService {
    public record Request(String principal, UUID conversationId, Path workspace, boolean gitAllowed, String message) {
        public Request {
            if (principal == null || principal.isBlank() || conversationId == null || workspace == null
                    || message == null || message.isBlank() || message.length() > 64000)
                throw new IllegalArgumentException("Invalid chat request");
        }
    }
    public record Outcome(UUID executionId, String answer, String error, CliExecution.Result execution) {}
    private final ChatClient client;
    private final CapabilityHandlerRegistry registry;
    private final Path authorizedRoot;
    private final ExecutionArtifactStore artifacts;

    public EngineeringChatService(ChatClient client, CapabilityHandlerRegistry registry, Path authorizedRoot,
                                  ExecutionArtifactStore artifacts) {
        this.client = client;
        this.registry = registry;
        this.authorizedRoot = authorizedRoot;
        this.artifacts = artifacts;
    }

    /** Existing callers keep the read-only Git tool registered; HTTP chooses per request. */
    public Outcome chat(Request request) {
        return chat(request, true);
    }

    public static String memoryKey(String principal, UUID conversationId) {
        return principal.length() + ":" + principal + ":" + conversationId;
    }

    public Outcome chat(Request request, boolean registerGitTool) {
        return chat(request, registerGitTool, null);
    }

    public Outcome chat(Request request, boolean registerGitTool, ChatClient selected) {
        return chat(request, registerGitTool, selected, TaskContext.EMPTY);
    }

    public Outcome chat(Request request, boolean registerGitTool, ChatClient selected, TaskContext context) {
        var active = selected != null ? selected : client;
        var id = UUID.randomUUID();
        var started = Instant.now();
        var tool = new GitTool(id, request);
        String answer = "", error = "";
        var status = CliExecution.Status.SUCCEEDED;
        try {
            if (active == null) {
                error = "AI_NOT_CONFIGURED";
                status = CliExecution.Status.REJECTED;
            } else {
                // Length prefix avoids ambiguous principal/conversation concatenation.
                String conversation = memoryKey(request.principal(), request.conversationId());
                var prompt = active.prompt().system(context.systemInstructions()).user(request.message());
                if (!context.reasoning().equals("default")) {
                    prompt = prompt.options(org.springframework.ai.openai.OpenAiChatOptions.builder()
                            .reasoningEffort(context.reasoning()));
                }
                if (registerGitTool) prompt = prompt.tools(tool.callback());
                var response = prompt.advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversation)).call().chatResponse();
                if (response == null || response.getResult() == null) {
                    error = "AI_EMPTY_RESPONSE";
                    status = CliExecution.Status.FAILED;
                } else {
                    answer = redact(response.getResult().getOutput().getText());
                    if (org.springframework.ai.model.tool.ToolCallLimitExceededException.FINISH_REASON
                            .equals(response.getResult().getMetadata().getFinishReason())) tool.error = "TOOL_CALL_LIMIT";
                }
                if (!tool.error.isEmpty()) error = tool.error;
            }
        } catch (RuntimeException failure) {
            // Do not persist exception messages: SDK errors can include headers or credentials.
            error = AiErrors.classify(failure);
            status = switch (error) {
                case "AI_CANCELLED" -> CliExecution.Status.CANCELLED;
                case "AI_TIMED_OUT" -> CliExecution.Status.TIMED_OUT;
                default -> CliExecution.Status.FAILED;
            };
        }
        var ended = Instant.now();
        var trace = new CliExecution.Trace(Map.of("started", started, "completed", ended), tool.events, "", false, tool.error);
        var refs = new ArrayList<CliExecution.Artifact>();
        String artifactError = "";
        try {
            // Audit only controlled codes and timestamps, never prompts, credentials or model payloads.
            String toolEvents = tool.events.stream().map(event -> "{\"sequence\":" + event.sequence()
                    + ",\"receivedAt\":\"" + event.receivedAt() + "\",\"code\":\"" + event.text() + "\"}")
                    .collect(java.util.stream.Collectors.joining(",", "[", "]"));
            String json = "{\"executionId\":\"" + id + "\",\"status\":\"" + status
                    + "\",\"error\":\"" + error + "\",\"startedAt\":\"" + started
                    + "\",\"completedAt\":\"" + ended + "\",\"toolEvents\":" + toolEvents + "}";
            refs.add(artifacts.save(id, "ai-trace", json.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception failure) {
            artifactError = "ARTIFACT_SAVE_FAILED";
        }
        var result = new CliExecution.Result(id, status, CliExecution.Approval.NOT_REQUIRED,
                CliExecution.Verification.UNVERIFIED, started, java.time.Duration.between(started, ended).toMillis(),
                null, error, List.of("spring-ai", "chat"), Set.of(), "", "",
                List.of(new CliExecution.Event(id, 1, started, CliExecution.Status.RUNNING),
                        new CliExecution.Event(id, 2, ended, status)), refs, trace, artifactError);
        return new Outcome(id, answer, error, result);
    }

    private static String redact(String value) {
        String text = SensitiveData.redact(value);
        text = text.replaceAll("(?i)Bearer\\s+[^\\s\"']+", "Bearer [REDACTED]")
                .replaceAll("sk-[A-Za-z0-9_-]+", "[REDACTED]");
        return text.length() > 16384 ? text.substring(0, 16384) : text;
    }

    public final class GitTool {
        private final UUID executionId;
        private final Request request;
        private final List<CliExecution.ReceivedLine> events = new ArrayList<>();
        private String error = "";
        GitTool(UUID executionId, Request request) { this.executionId = executionId; this.request = request; }

        org.springframework.ai.tool.ToolCallback callback() {
            var delegate = org.springframework.ai.support.ToolCallbacks.from(this)[0];
            return new org.springframework.ai.tool.ToolCallback() {
                public org.springframework.ai.tool.definition.ToolDefinition getToolDefinition() {
                    return delegate.getToolDefinition();
                }
                public String call(String arguments) {
                    if (arguments == null || !arguments.matches("\\s*\\{\\s*\\}\\s*")) {
                        error = "TOOL_INVALID_ARGUMENTS";
                        if (events.size() < 16) events.add(new CliExecution.ReceivedLine(events.size() + 1, Instant.now(), error));
                        return error;
                    }
                    return delegate.call(arguments);
                }
            };
        }

        @Tool(description = "Read Git status for the server-authorized repository. No path or shell arguments accepted.")
        public String gitStatus() {
            String code;
            String output;
            try {
                if (!request.gitAllowed() || authorizedRoot == null) throw new SecurityException();
                var root = authorizedRoot.toRealPath();
                var workspace = request.workspace().toRealPath();
                if (!workspace.startsWith(root)) throw new SecurityException();
                var handler = registry.resolveFor(null, "git-status").orElseThrow(SecurityException::new);
                var context = new CapabilityContext(new ExpertManifest.Step("ai-git", "Git status", "git-status", true),
                        null, "", "", "spring-ai", executionId, List.of(), new HashMap<>(), new HashMap<>(),
                        new ArrayList<>(), new ArrayList<>(), List.of(), workspace);
                var result = handler.handle(context);
                code = result.success() ? "TOOL_SUCCEEDED" : "TOOL_FAILED";
                output = result.success() ? redact(String.valueOf(result.data())) : code;
            } catch (SecurityException denied) {
                code = "TOOL_PERMISSION_DENIED";
                output = code;
            } catch (Exception failure) {
                code = "TOOL_FAILED";
                output = code;
            }
            if (!code.equals("TOOL_SUCCEEDED")) error = code;
            // Bound trace growth even if a model repeatedly requests a denied tool.
            if (events.size() < 16) events.add(new CliExecution.ReceivedLine(events.size() + 1, Instant.now(), code));
            return output;
        }
    }
}
