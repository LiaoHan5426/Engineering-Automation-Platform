package com.lh.eap.ai;
import com.openai.core.JsonValue;
import com.openai.models.Reasoning;
import com.openai.models.ReasoningEffort;
import java.util.concurrent.CancellationException;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import org.springframework.ai.chat.messages.MessageType;
import org.springframework.ai.chat.metadata.ChatGenerationMetadata;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.ai.openai.OpenAiChatOptions;
import tools.jackson.databind.json.JsonMapper;
import com.lh.eap.error.ModelErrors;

import com.openai.client.OpenAIClient;
import com.openai.models.responses.*;
import java.time.Duration;
import java.util.*;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;

/** Responses wire adapter. Spring AI owns tool execution; this class never invokes callbacks. */
class OpenAiResponsesChatModel implements ChatModel {
    private static final String WIRE_ITEMS = "eap.responses.outputItems";
    private static final int OUTPUT_LIMIT = 256000;
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final OpenAIClient client;
    private final String model;

    OpenAiResponsesChatModel(ModelConnectionSnapshot snapshot) {
        this(ResponsesDeadlineInterceptor.client(snapshot.secret, snapshot.baseUrl, Duration.ofSeconds(180),
                Duration.ofSeconds(10), Duration.ofSeconds(90), Duration.ofSeconds(30)), snapshot.model);
    }

    OpenAiResponsesChatModel(OpenAIClient client, String model) { this.client = client; this.model = model; }

    @Override public ChatOptions getOptions() {
        return OpenAiChatOptions.builder().model(model).build();
    }

    @Override public ChatResponse call(Prompt prompt) {
        var output = new StringBuilder();
        var items = consume(prompt, output::append, () -> false, ignored -> {});
        return response(output.toString(), items);
    }

    @Override public reactor.core.publisher.Flux<ChatResponse> stream(Prompt prompt) {
        return reactor.core.publisher.Flux.create(sink -> {
            try {
                var items = consume(prompt, text -> sink.next(response(text, List.of())), sink::isCancelled, action -> sink.onCancel(action::run));
                if (!items.isEmpty() && !sink.isCancelled()) sink.next(response("", items));
                if (!sink.isCancelled()) sink.complete();
            } catch (RuntimeException failure) { sink.error(failure); }
        });
    }

    private static ChatResponse response(String text, List<ResponseInputItem> items) {
        var calls = new ArrayList<AssistantMessage.ToolCall>();
        for (var item : items) item.functionCall().ifPresent(call ->
                calls.add(new AssistantMessage.ToolCall(call.callId(), "function", call.name(), call.arguments())));
        var message = AssistantMessage.builder().content(text).toolCalls(calls)
                .properties(items.isEmpty() ? Map.of() : Map.of(WIRE_ITEMS, List.copyOf(items))).build();
        return new ChatResponse(List.of(new Generation(message,
                ChatGenerationMetadata.builder().finishReason(calls.isEmpty() ? "stop" : "tool_calls").build())));
    }

    private List<ResponseInputItem> consume(Prompt prompt, Consumer<String> delta, BooleanSupplier cancelled, Consumer<Runnable> onCancel) {
        boolean completed = false; int length = 0;
        var output = new TreeMap<Long, ResponseOutputItem>();
        try (var events = client.responses().createStreaming(parameters(prompt, model))) {
            onCancel.accept(events::close);
            var iterator = events.stream().iterator();
            while (!cancelled.getAsBoolean() && !Thread.currentThread().isInterrupted() && iterator.hasNext()) {
                var event = iterator.next();
                if (event.outputTextDelta().isPresent()) {
                    String text = event.outputTextDelta().get().delta(); length += text.length();
                    if (length > OUTPUT_LIMIT) throw new IllegalStateException(ModelErrors.AI_RESPONSE_OUTPUT_LIMIT.code());
                    delta.accept(text);
                }
                if (event.functionCallArgumentsDelta().isPresent()) {
                    length += event.functionCallArgumentsDelta().get().delta().length();
                    if (length > OUTPUT_LIMIT) throw new IllegalStateException(ModelErrors.AI_RESPONSE_OUTPUT_LIMIT.code());
                }
                event.outputItemDone().ifPresent(done -> {
                    if (output.size() >= 64 || output.putIfAbsent(done.outputIndex(), done.item()) != null)
                        throw new IllegalStateException(ModelErrors.AI_RESPONSE_ITEMS_INVALID.code());
                    validateOutput(output.values(), prompt);
                });
                if (event.failed().isPresent() || event.error().isPresent() || event.incomplete().isPresent())
                    throw new IllegalStateException(ModelErrors.AI_RESPONSE_FAILED.code());
                if (event.completed().isPresent()) {
                    var finalItems = event.completed().get().response().output();
                    if (!finalItems.isEmpty()) {
                        if (!output.isEmpty() && !new ArrayList<>(output.values()).equals(finalItems))
                            throw new IllegalStateException(ModelErrors.AI_RESPONSE_ITEMS_INVALID.code());
                        output.clear();
                        for (int i = 0; i < finalItems.size(); i++) output.put((long) i, finalItems.get(i));
                    }
                    completed = true; break;
                }
            }
        }
        if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw new CancellationException();
        if (!completed) throw new IllegalStateException(ModelErrors.AI_RESPONSE_INCOMPLETE.code());
        return validateOutput(output.values(), prompt);
    }

    private static List<ResponseInputItem> validateOutput(Collection<ResponseOutputItem> output, Prompt prompt) {
        if (output.size() > 64) throw new IllegalStateException(ModelErrors.AI_RESPONSE_OUTPUT_LIMIT.code());
        var allowed = new HashSet<String>();
        if (prompt.getOptions() instanceof ToolCallingChatOptions tools && tools.getToolCallbacks() != null)
            tools.getToolCallbacks().forEach(callback -> allowed.add(callback.getToolDefinition().name()));
        var calls = new HashSet<String>(); var items = new ArrayList<ResponseInputItem>(); int size = 0;
        for (var item : output) {
            size += item.toString().length();
            if (size > OUTPUT_LIMIT) throw new IllegalStateException(ModelErrors.AI_RESPONSE_OUTPUT_LIMIT.code());
            if (item.functionCall().isPresent()) {
                var call = item.functionCall().get();
                if (call.callId().isBlank() || !calls.add(call.callId()) || !allowed.contains(call.name())
                        || call.arguments().length() > 64000 || !JSON.readTree(call.arguments()).isObject())
                    throw new IllegalStateException(ModelErrors.AI_RESPONSE_TOOL_INVALID.code());
                items.add(ResponseInputItem.ofFunctionCall(call));
            } else if (item.reasoning().isPresent()) {
                items.add(ResponseInputItem.ofReasoning(item.reasoning().get()));
            } else if (item.message().isEmpty()) {
                throw new IllegalStateException(ModelErrors.AI_RESPONSE_TOOL_UNSUPPORTED.code());
            }
        }
        return List.copyOf(items);
    }

    static ResponseCreateParams parameters(Prompt prompt, String model) {
        var input = new ArrayList<ResponseInputItem>(); var instructions = new StringBuilder();
        var pending = new HashMap<String, String>();
        for (var message : prompt.getInstructions()) {
            if (message instanceof AssistantMessage assistant) {
                for (var call : assistant.getToolCalls()) {
                    if (!"function".equals(call.type()) || call.id().isBlank() || pending.putIfAbsent(call.id(), call.name()) != null)
                        throw new IllegalArgumentException(ModelErrors.AI_TOOL_HISTORY_INVALID.code());
                }
                // Retain encrypted reasoning and original wire IDs within this request's tool loop only.
                var carried = assistant.getMetadata().get(WIRE_ITEMS);
                if (carried instanceof List<?> items) {
                    for (var item : items) {
                        if (!(item instanceof ResponseInputItem wire)) throw new IllegalArgumentException(ModelErrors.AI_TOOL_HISTORY_INVALID.code());
                        input.add(wire);
                    }
                } else for (var call : assistant.getToolCalls()) input.add(ResponseInputItem.ofFunctionCall(
                        ResponseFunctionToolCall.builder().callId(call.id()).name(call.name()).arguments(call.arguments()).build()));
                if (assistant.getText() == null || assistant.getText().isEmpty()) continue;
            }
            if (message instanceof ToolResponseMessage results) {
                for (var result : results.getResponses()) {
                    if (!Objects.equals(pending.remove(result.id()), result.name())) throw new IllegalArgumentException(ModelErrors.AI_TOOL_HISTORY_INVALID.code());
                    input.add(ResponseInputItem.ofFunctionCallOutput(ResponseInputItem.FunctionCallOutput.builder()
                            .callId(result.id()).output(result.responseData()).build()));
                }
                continue;
            }
            switch (message.getMessageType()) {
                case SYSTEM -> instructions.append(message.getText()).append('\n');
                case USER, ASSISTANT -> {
                    var wire = EasyInputMessage.builder().role(message.getMessageType() == MessageType.USER
                            ? EasyInputMessage.Role.USER : EasyInputMessage.Role.ASSISTANT);
                    String text = message.getText() == null ? "" : message.getText();
                    if (message instanceof org.springframework.ai.chat.messages.UserMessage user && !user.getMedia().isEmpty()) {
                        var parts = new ArrayList<ResponseInputContent>();
                        parts.add(ResponseInputContent.ofInputText(ResponseInputText.builder().text(text).build()));
                        for (var media : user.getMedia()) {
                            String mime = media.getMimeType().toString();
                            if (!Set.of("image/png", "image/jpeg", "image/webp").contains(mime)
                                    || !(media.getData() instanceof byte[]))
                                throw new IllegalArgumentException(com.lh.eap.error.ChatErrors.IMAGE_INPUT_NOT_SUPPORTED.code());
                            parts.add(ResponseInputContent.ofInputImage(ResponseInputImage.builder()
                                    .detail(ResponseInputImage.Detail.AUTO)
                                    .imageUrl("data:" + mime + ";base64," + Base64.getEncoder().encodeToString(media.getDataAsByteArray())).build()));
                        }
                        wire.contentOfResponseInputMessageContentList(parts);
                    } else wire.content(text);
                    input.add(ResponseInputItem.ofEasyInputMessage(wire.build()));
                }
                default -> throw new IllegalArgumentException(ModelErrors.AI_PROTOCOL_TOOLS_UNAVAILABLE.code());
            }
        }
        if (!pending.isEmpty()) throw new IllegalArgumentException(ModelErrors.AI_TOOL_HISTORY_INCOMPLETE.code());
        var params = ResponseCreateParams.builder().model(model).store(false).inputOfResponse(input).instructions(instructions.toString());
        if (prompt.getOptions() != null && prompt.getOptions().getMaxTokens() != null)
            params.maxOutputTokens(prompt.getOptions().getMaxTokens());
        if (prompt.getOptions() instanceof ToolCallingChatOptions tools) {
            if (tools.getToolCallbacks() != null && !tools.getToolCallbacks().isEmpty()) {
                params.parallelToolCalls(false).addInclude(ResponseIncludable.REASONING_ENCRYPTED_CONTENT);
                var names = new HashSet<String>();
                for (var callback : tools.getToolCallbacks()) {
                    var definition = callback.getToolDefinition();
                    if (!names.add(definition.name())) throw new IllegalArgumentException(ModelErrors.AI_TOOL_NAME_DUPLICATE.code());
                    var schema = JSON.readValue(definition.inputSchema(), Map.class);
                    var parameters = FunctionTool.Parameters.builder();
                    schema.forEach((key, value) -> parameters.putAdditionalProperty(key.toString(), JsonValue.from(value)));
                    params.addTool(FunctionTool.builder().name(definition.name()).description(definition.description())
                            .parameters(parameters.build()).strict(false).build());
                }
            }
        }
        if (prompt.getOptions() instanceof OpenAiChatOptions options && options.getReasoningEffort() != null)
            params.reasoning(Reasoning.builder().effort(ReasoningEffort.of(options.getReasoningEffort())).build());
        return params.build();
    }
}
