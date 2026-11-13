package com.lh.eap.ai;
import java.time.Duration;
import java.util.Set;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.stream.Collectors;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;
import org.springframework.ai.model.tool.ToolCallLimitExceededException;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.support.ToolCallbacks;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import com.lh.eap.error.WorkspaceErrors;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.CodeErrors;
import com.lh.eap.error.ModelErrors;
import com.lh.eap.error.ToolErrors;
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
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder()
            .enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
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
            UUID executionId, BooleanSupplier cancelled) {
        return chat(request, registerGitTool, selected, context, executionId, cancelled, null);
    }

    public Outcome chat(Request request, boolean registerGitTool, ChatClient selected, TaskContext context,
            UUID executionId, BooleanSupplier cancelled, Consumer<String> delta) {
        return chat(request, registerGitTool, selected, context, executionId, cancelled, delta, null);
    }
    Outcome chat(Request request, boolean registerGitTool, ChatClient selected, TaskContext context,
            UUID executionId, BooleanSupplier cancelled, Consumer<String> delta, CodeSourceTool sources) {
        var active = selected != null ? selected : client;
        var id = executionId == null ? UUID.randomUUID() : executionId;
        var started = Instant.now();
        var tool = new GitTool(id, request);
        String answer = "", error = "";
        List<String> failureTypes = List.of();
        var status = CliExecution.Status.SUCCEEDED;
        try {
            if (cancelled != null && cancelled.getAsBoolean()) {
                error = ModelErrors.AI_CANCELLED.code();
                status = CliExecution.Status.CANCELLED;
            } else if (active == null) {
                error = ModelErrors.AI_NOT_CONFIGURED.code();
                status = CliExecution.Status.REJECTED;
            } else {
                // Length prefix avoids ambiguous principal/conversation concatenation.
                String conversation = memoryKey(request.principal(), request.conversationId());
                var prompt = active.prompt().system(context.systemInstructions() + (sources == null ? "" : sources.instructions())).user(request.message());
                if (!context.reasoning().equals("default")) {
                    prompt = prompt.options(OpenAiChatOptions.builder()
                            .reasoningEffort(context.reasoning()));
                }
                if (registerGitTool && !context.mode().equals(TaskMode.PLAN.wire())) prompt = prompt.tools(tool.callback());
                if (sources != null) prompt = prompt.tools(sources);
                var prepared = prompt.advisors(a -> a.param(ChatMemory.CONVERSATION_ID, conversation));
                ChatResponse response;
                if (delta != null && !context.mode().equals("code")) {
                    var text = new StringBuilder();
                    var pending = new StringBuilder();
                    ChatResponse last = null;
                    int frames = 0;
                    // Complete lines are redacted together, so a secret split across provider chunks cannot leak.
                    try (var stream = prepared.stream().chatResponse().subscribeOn(reactor.core.scheduler.Schedulers.boundedElastic()).timeout(Duration.ofSeconds(60)).toStream()) {
                        var iterator = stream.iterator();
                        while (iterator.hasNext()) {
                            if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw new CancellationException();
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
                    response = last == null ? null : new ChatResponse(List.of(
                            new Generation(new AssistantMessage(text.toString()),
                                    last.getResult() == null ? null : last.getResult().getMetadata())));
                } else response = prepared.call().chatResponse();
                if ((cancelled != null && cancelled.getAsBoolean()) || Thread.currentThread().isInterrupted()) {
                    Thread.interrupted();
                    error = ModelErrors.AI_CANCELLED.code();
                    status = CliExecution.Status.CANCELLED;
                    answer = "";
                } else if (response == null || response.getResult() == null) {
                    error = ModelErrors.AI_EMPTY_RESPONSE.code();
                    status = CliExecution.Status.FAILED;
                } else {
                    String text = response.getResult().getOutput().getText();
                    if (context.mode().equals("code")) {
                        // A JSON proposal must stay complete. Never apply the ordinary-chat clip.
                        if (text != null && text.length() > CodeChangeService.MAX_PROPOSAL_RESPONSE_CHARS) {
                            error = CodeErrors.CODE_PROPOSAL_TOO_LARGE.code();
                            status = CliExecution.Status.FAILED;
                        } else {
                            // Never rewrite executable content. Check decoded JSON before it can be persisted.
                            if (sensitiveProposal(text)) {
                                error = CodeErrors.INVALID_CODE_PROPOSAL.code();
                                status = CliExecution.Status.FAILED;
                            } else answer = text == null ? "" : text;
                        }
                    } else {
                        answer = redact(text);
                    }
                    if (ToolCallLimitExceededException.FINISH_REASON
                            .equals(response.getResult().getMetadata().getFinishReason())) tool.error = ToolErrors.TOOL_CALL_LIMIT.code();
                }
                if (!tool.error.isEmpty()) error = tool.error;
                if (sources != null && error.isEmpty()) {
                    error = sources.completionError();
                    if (!error.isEmpty()) { answer = ""; status = CliExecution.Status.FAILED; }
                }
            }
        } catch (RuntimeException failure) {
            // Only bounded class names are diagnostic evidence; messages may contain credentials.
            failureTypes = failureTypes(failure);
            error = AiErrors.classify(failure);
            status = switch (error) {
                case "AI_CANCELLED" -> CliExecution.Status.CANCELLED;
                case "AI_TIMED_OUT" -> CliExecution.Status.TIMED_OUT;
                default -> CliExecution.Status.FAILED;
            };
        }
        // A model answer after a failed tool does not make the requested execution successful.
        if (status == CliExecution.Status.SUCCEEDED && !error.isEmpty()) status = CliExecution.Status.FAILED;
        if (sources != null) tool.events.addAll(sources.events());
        var ended = Instant.now();
        var trace = new CliExecution.Trace(Map.of("started", started, "completed", ended), tool.events, "", false, tool.error);
        var refs = new ArrayList<CliExecution.Artifact>();
        String artifactError = "";
        try {
            // Audit controlled codes, timestamps and bounded exception types, never exception content.
            String toolEvents = tool.events.stream().map(event -> "{\"sequence\":" + event.sequence()
                    + ",\"receivedAt\":\"" + event.receivedAt() + "\",\"code\":\"" + event.text() + "\"}")
                    .collect(Collectors.joining(",", "[", "]"));
            String json = "{\"executionId\":\"" + id + "\",\"status\":\"" + status
                    + "\",\"error\":\"" + error + "\",\"startedAt\":\"" + started
                    + "\",\"completedAt\":\"" + ended + "\",\"toolEvents\":" + toolEvents
                    + ",\"failureTypes\":" + JSON.writeValueAsString(failureTypes) + "}";
            refs.add(artifacts.save(id, "ai-trace", json.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception failure) {
            artifactError = ExecutionErrors.ARTIFACT_SAVE_FAILED.code();
        }
        var result = new CliExecution.Result(id, status, CliExecution.Approval.NOT_REQUIRED,
                CliExecution.Verification.UNVERIFIED, started, Duration.between(started, ended).toMillis(),
                null, error, List.of("spring-ai", "chat"), Set.of(), "", "",
                List.of(new CliExecution.Event(id, 1, started, CliExecution.Status.RUNNING),
                        new CliExecution.Event(id, 2, ended, status)), refs, trace, artifactError);
        return new Outcome(id, answer, error, result);
    }

    private static List<String> failureTypes(Throwable failure) {
        var visited = Collections.newSetFromMap(new IdentityHashMap<Throwable, Boolean>());
        var types = new ArrayList<String>();
        for (var cause = failure; cause != null && types.size() < 8 && visited.add(cause); cause = cause.getCause()) {
            types.add(cause.getClass().getName());
        }
        return List.copyOf(types);
    }

    private static boolean sensitiveProposal(String answer) {
        if (answer == null || answer.isBlank()) return true;
        try {
            String json = answer.strip();
            if (json.startsWith("```json\n") || json.startsWith("```\n")) {
                if (!json.endsWith("```")) return true;
                json = json.substring(json.indexOf('\n') + 1, json.length() - 3).strip();
            }
            Object decoded = JSON.readValue(json, Object.class);
            if (!(decoded instanceof Map<?, ?> root)) return true;
            for (var entry : root.entrySet()) {
                if (entry.getKey().equals("files") && entry.getValue() instanceof List<?> files) {
                    for (var file : files) if (sensitiveProposalValue(file, true)) return true;
                } else if (sensitiveProposalValue(Collections.singletonMap(entry.getKey(), entry.getValue()), false)) return true;
            }
            return false;
        } catch (RuntimeException malformed) {
            return true;
        }
    }

    private static boolean sensitiveProposalValue(Object value, boolean fileEntry) {
        if (value instanceof Map<?, ?> map) {
            for (var entry : map.entrySet()) {
                if (SensitiveData.containsSecret(Collections.singletonMap(entry.getKey(), ""))) return true;
                if (fileEntry && entry.getKey().equals("content") && entry.getValue() instanceof String source) {
                    if (SensitiveData.containsSecretInSource(source)
                            || !source.equals(source.replaceAll("(?i)Bearer\\s+[^\\s\"']+", "Bearer [REDACTED]"))) return true;
                } else if (sensitiveProposalValue(entry.getValue(), false)) return true;
            }
        } else if (value instanceof Iterable<?> list) {
            for (var item : list) if (sensitiveProposalValue(item, false)) return true;
        } else if (value instanceof String text) return !text.equals(redactComplete(text));
        return false;
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

        ToolCallback callback() {
            var delegate = ToolCallbacks.from(this)[0];
            return new ToolCallback() {
                public ToolDefinition getToolDefinition() {
                    return delegate.getToolDefinition();
                }
                public String call(String arguments) {
                    if (arguments == null || !arguments.matches("\\s*\\{\\s*\\}\\s*")) {
                        error = ToolErrors.TOOL_INVALID_ARGUMENTS.code();
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
                                ? new RuntimeWorkspace.Decision(null, WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code())
                                : new RuntimeWorkspace.Decision(authorizedRoot, null));
                if (!request.gitAllowed() || !decision.allowed() || decision.path() == null) throw new SecurityException();
                var root = decision.path().toRealPath();
                var workspace = request.workspace().toRealPath();
                if (!workspace.startsWith(root)) throw new SecurityException();
                var handler = registry.resolveFor(null, "git-status").orElseThrow(SecurityException::new);
                var context = new CapabilityContext(new ExpertManifest.Step("ai-git", "Git status", "git-status", true),
                        null, "", "", "spring-ai", executionId, List.of(), new HashMap<>(), new HashMap<>(),
                        new ArrayList<>(), new ArrayList<>(), List.of(), workspace, Set.of());
                var result = handler.handle(context);
                code = result.success() ? "TOOL_SUCCEEDED" : ToolErrors.TOOL_FAILED.code();
                output = result.success() ? redact(String.valueOf(result.data())) : code;
            } catch (SecurityException denied) {
                code = ToolErrors.TOOL_PERMISSION_DENIED.code();
                output = code;
            } catch (Exception failure) {
                code = ToolErrors.TOOL_FAILED.code();
                output = code;
            }
            if (!code.equals("TOOL_SUCCEEDED")) error = code;
            // Bound trace growth even if a model repeatedly requests a denied tool.
            if (events.size() < 16) events.add(new CliExecution.ReceivedLine(events.size() + 1, Instant.now(), code));
            return output;
        }
    }
}
