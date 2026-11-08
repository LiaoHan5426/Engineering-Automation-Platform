package com.lh.eap.ai;
import com.lh.eap.delivery.CodeChangeService;

import com.lh.eap.api.CliExecution;
import com.lh.eap.application.service.ExecutionArtifactStore;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.config.RuntimeWorkspace;
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
    private final RuntimeWorkspace runtime;
    private final Path authorizedRoot;
    private final ExecutionArtifactStore artifacts;

    public EngineeringChatService(ChatClient client, CapabilityHandlerRegistry registry, Path authorizedRoot,
                                  ExecutionArtifactStore artifacts) {
        this(client, registry, null, authorizedRoot, artifacts);
    }

    public EngineeringChatService(ChatClient client, CapabilityHandlerRegistry registry, RuntimeWorkspace runtime,
                                  ExecutionArtifactStore artifacts) {
        this(client, registry, runtime, null, artifacts);
    }

    private EngineeringChatService(ChatClient client, CapabilityHandlerRegistry registry, RuntimeWorkspace runtime,
                                   Path authorizedRoot, ExecutionArtifactStore artifacts) {
        this.client = client;
        this.registry = registry;
        this.runtime = runtime;
        this.authorizedRoot = authorizedRoot;
        this.artifacts = artifacts;
    }

    /** Existing callers keep the read-only Git tool registered; HTTP chooses per request. */
    public Outcome chat(Request request) {
        return chat(request, true);
    }

    public static String memoryKey(String principal, UUID conversationId) {
        return ChatClients.memoryKey(principal, conversationId);
    }

    public Outcome chat(Request request, boolean registerGitTool) {
        return chat(request, registerGitTool, null);
    }

    public Outcome chat(Request request, boolean registerGitTool, ChatClient selected) {
        return chat(request, registerGitTool, selected, TaskContext.EMPTY);
    }

    public Outcome chat(Request request, boolean registerGitTool, ChatClient selected, TaskContext context) {
        return chat(request, registerGitTool, selected, context, UUID.randomUUID(), () -> false);
    }

    public Outcome chat(Request request, boolean registerGitTool, ChatClient selected, TaskContext context,
            UUID executionId, java.util.function.BooleanSupplier cancelled) {
        return chat(request, registerGitTool, selected, context, executionId, cancelled, null);
    }

    public Outcome chat(Request request, boolean registerGitTool, ChatClient selected, TaskContext context,
            UUID executionId, java.util.function.BooleanSupplier cancelled, java.util.function.Consumer<String> delta) {
        var active = selected != null ? selected : client;
        var id = executionId == null ? UUID.randomUUID() : executionId;
        var started = Instant.now();
        var tool = new GitTool(id, request);
        String answer = "", error = "";
        var status = CliExecution.Status.SUCCEEDED;
        try {
            if (cancelled != null && cancelled.getAsBoolean()) {
                error = "AI_CANCELLED";
                status = CliExecution.Status.CANCELLED;
            } else if (active == null) {
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
                var prepared = prompt.advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversation));
                org.springframework.ai.chat.model.ChatResponse response;
                if (delta != null && context.mode().equals("chat")) {
                    var text = new StringBuilder();
                    var pending = new StringBuilder();
                    org.springframework.ai.chat.model.ChatResponse last = null;
                    int frames = 0;
                    // Complete lines are redacted together, so a secret split across provider chunks cannot leak.
                    try (var stream = prepared.stream().chatResponse().subscribeOn(reactor.core.scheduler.Schedulers.boundedElastic()).timeout(java.time.Duration.ofSeconds(60)).toStream()) {
                        var iterator = stream.iterator();
                        while (iterator.hasNext()) {
                            if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException();
                            last = iterator.next();
                            if (last.getResult() == null) continue;
                            String part = last.getResult().getOutput().getText();
                            if (part == null) continue;
                            int remaining = 16384 - text.length();
                            if (part.length() > remaining) part = part.substring(0, remaining);
                            text.append(part); pending.append(part);
                            int newline = pending.lastIndexOf("\n");
                            if (newline >= 0 && frames < 255) {
                                delta.accept(redact(pending.substring(0, newline + 1))); frames++;
                                pending.delete(0, newline + 1);
                            }
                        }
                    }
                    if (!pending.isEmpty()) delta.accept(redact(pending.toString()));
                    response = last == null ? null : new org.springframework.ai.chat.model.ChatResponse(List.of(
                            new org.springframework.ai.chat.model.Generation(new org.springframework.ai.chat.messages.AssistantMessage(text.toString()),
                                    last.getResult() == null ? null : last.getResult().getMetadata())));
                } else response = prepared.call().chatResponse();
                if ((cancelled != null && cancelled.getAsBoolean()) || Thread.currentThread().isInterrupted()) {
                    Thread.interrupted();
                    error = "AI_CANCELLED";
                    status = CliExecution.Status.CANCELLED;
                    answer = "";
                } else if (response == null || response.getResult() == null) {
                    error = "AI_EMPTY_RESPONSE";
                    status = CliExecution.Status.FAILED;
                } else {
                    String text = response.getResult().getOutput().getText();
                    if (context.mode().equals("code")) {
                        // A JSON proposal must stay complete. Never apply the ordinary-chat clip.
                        if (text != null && text.length() > CodeChangeService.MAX_PROPOSAL_RESPONSE_CHARS) {
                            error = "CODE_PROPOSAL_TOO_LARGE";
                            status = CliExecution.Status.FAILED;
                        } else {
                            answer = redactComplete(text);
                            if (answer.length() > CodeChangeService.MAX_PROPOSAL_RESPONSE_CHARS) {
                                answer = "";
                                error = "CODE_PROPOSAL_TOO_LARGE";
                                status = CliExecution.Status.FAILED;
                            }
                        }
                    } else {
                        answer = redact(text);
                    }
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
        String text = redactComplete(value);
        return text.length() > 16384 ? text.substring(0, 16384) : text;
    }

    private static String redactComplete(String value) {
        String text = SensitiveData.redact(value);
        return text.replaceAll("(?i)Bearer\\s+[^\\s\"']+", "Bearer [REDACTED]");
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
                var decision = runtime != null ? runtime.root()
                        : (authorizedRoot == null
                                ? new RuntimeWorkspace.Decision(null, "AUTHORIZED_ROOT_MISSING")
                                : new RuntimeWorkspace.Decision(authorizedRoot, null));
                if (!request.gitAllowed() || !decision.allowed() || decision.path() == null) throw new SecurityException();
                var root = decision.path().toRealPath();
                var workspace = request.workspace().toRealPath();
                if (!workspace.startsWith(root)) throw new SecurityException();
                var handler = registry.resolveFor(null, "git-status").orElseThrow(SecurityException::new);
                var context = new CapabilityContext(new ExpertManifest.Step("ai-git", "Git status", "git-status", true),
                        null, "", "", "spring-ai", executionId, List.of(), new HashMap<>(), new HashMap<>(),
                        new ArrayList<>(), new ArrayList<>(), List.of(), workspace, java.util.Set.of());
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
