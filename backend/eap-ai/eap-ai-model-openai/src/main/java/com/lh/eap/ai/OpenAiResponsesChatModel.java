package com.lh.eap.ai;

import com.openai.client.OpenAIClient;
import com.openai.client.OpenAIClientImpl;
import com.openai.core.ClientOptions;
import com.openai.models.responses.*;
import java.time.Duration;
import java.util.*;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.openai.http.okhttp.SpringAiOpenAiHttpClient;

/** Responses wire adapter. Spring AI owns tool execution; this class never invokes callbacks. */
class OpenAiResponsesChatModel implements ChatModel {
    private static final String WIRE_ITEMS = "eap.responses.outputItems";
    private static final int OUTPUT_LIMIT = 256000;
    private static final tools.jackson.databind.json.JsonMapper JSON = tools.jackson.databind.json.JsonMapper.builder().build();
    private final OpenAIClient client;
    private final String model;

    OpenAiResponsesChatModel(ModelConnectionSnapshot snapshot) {
        this(new OpenAIClientImpl(ClientOptions.builder().apiKey(snapshot.secret).baseUrl(snapshot.baseUrl)
                .httpClient(SpringAiOpenAiHttpClient.builder().timeout(Duration.ofSeconds(45)).build())
                .timeout(Duration.ofSeconds(45)).maxRetries(0).build()), snapshot.model);
    }

    OpenAiResponsesChatModel(OpenAIClient client, String model) { this.client = client; this.model = model; }

    @Override public org.springframework.ai.chat.prompt.ChatOptions getOptions() {
        return org.springframework.ai.openai.OpenAiChatOptions.builder().model(model).build();
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
                org.springframework.ai.chat.metadata.ChatGenerationMetadata.builder().finishReason(calls.isEmpty() ? "stop" : "tool_calls").build())));
    }

    private List<ResponseInputItem> consume(Prompt prompt, java.util.function.Consumer<String> delta, java.util.function.BooleanSupplier cancelled, java.util.function.Consumer<Runnable> onCancel) {
        boolean completed = false; int length = 0;
        var output = new TreeMap<Long, ResponseOutputItem>();
        try (var events = client.responses().createStreaming(parameters(prompt, model))) {
            onCancel.accept(events::close);
            var iterator = events.stream().iterator();
            while (!cancelled.getAsBoolean() && !Thread.currentThread().isInterrupted() && iterator.hasNext()) {
                var event = iterator.next();
                if (event.outputTextDelta().isPresent()) {
                    String text = event.outputTextDelta().get().delta(); length += text.length();
                    if (length > OUTPUT_LIMIT) throw new IllegalStateException("AI_RESPONSE_OUTPUT_LIMIT");
                    delta.accept(text);
                }
                if (event.functionCallArgumentsDelta().isPresent()) {
                    length += event.functionCallArgumentsDelta().get().delta().length();
                    if (length > OUTPUT_LIMIT) throw new IllegalStateException("AI_RESPONSE_OUTPUT_LIMIT");
                }
                event.outputItemDone().ifPresent(done -> {
                    if (output.size() >= 64 || output.putIfAbsent(done.outputIndex(), done.item()) != null)
                        throw new IllegalStateException("AI_RESPONSE_ITEMS_INVALID");
                    validateOutput(output.values(), prompt);
                });
                if (event.failed().isPresent() || event.error().isPresent() || event.incomplete().isPresent())
                    throw new IllegalStateException("AI_RESPONSE_FAILED");
                if (event.completed().isPresent()) {
                    var finalItems = event.completed().get().response().output();
                    if (!finalItems.isEmpty()) {
                        if (!output.isEmpty() && !new ArrayList<>(output.values()).equals(finalItems))
                            throw new IllegalStateException("AI_RESPONSE_ITEMS_INVALID");
                        output.clear();
                        for (int i = 0; i < finalItems.size(); i++) output.put((long) i, finalItems.get(i));
                    }
                    completed = true; break;
                }
            }
        }
        if (cancelled.getAsBoolean() || Thread.currentThread().isInterrupted()) throw new java.util.concurrent.CancellationException();
        if (!completed) throw new IllegalStateException("AI_RESPONSE_INCOMPLETE");
        return validateOutput(output.values(), prompt);
    }

    private static List<ResponseInputItem> validateOutput(Collection<ResponseOutputItem> output, Prompt prompt) {
        if (output.size() > 64) throw new IllegalStateException("AI_RESPONSE_OUTPUT_LIMIT");
        var allowed = new HashSet<String>();
        if (prompt.getOptions() instanceof ToolCallingChatOptions tools && tools.getToolCallbacks() != null)
            tools.getToolCallbacks().forEach(callback -> allowed.add(callback.getToolDefinition().name()));
        var calls = new HashSet<String>(); var items = new ArrayList<ResponseInputItem>(); int size = 0;
        for (var item : output) {
            size += item.toString().length();
            if (size > OUTPUT_LIMIT) throw new IllegalStateException("AI_RESPONSE_OUTPUT_LIMIT");
            if (item.functionCall().isPresent()) {
                var call = item.functionCall().get();
                if (call.callId().isBlank() || !calls.add(call.callId()) || !allowed.contains(call.name())
                        || call.arguments().length() > 64000 || !JSON.readTree(call.arguments()).isObject())
                    throw new IllegalStateException("AI_RESPONSE_TOOL_INVALID");
                items.add(ResponseInputItem.ofFunctionCall(call));
            } else if (item.reasoning().isPresent()) {
                items.add(ResponseInputItem.ofReasoning(item.reasoning().get()));
            } else if (item.message().isEmpty()) {
                throw new IllegalStateException("AI_RESPONSE_TOOL_UNSUPPORTED");
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
                        throw new IllegalArgumentException("AI_TOOL_HISTORY_INVALID");
                }
                // Retain encrypted reasoning and original wire IDs within this request's tool loop only.
                var carried = assistant.getMetadata().get(WIRE_ITEMS);
                if (carried instanceof List<?> items) {
                    for (var item : items) {
                        if (!(item instanceof ResponseInputItem wire)) throw new IllegalArgumentException("AI_TOOL_HISTORY_INVALID");
                        input.add(wire);
                    }
                } else for (var call : assistant.getToolCalls()) input.add(ResponseInputItem.ofFunctionCall(
                        ResponseFunctionToolCall.builder().callId(call.id()).name(call.name()).arguments(call.arguments()).build()));
                if (assistant.getText() == null || assistant.getText().isEmpty()) continue;
            }
            if (message instanceof ToolResponseMessage results) {
                for (var result : results.getResponses()) {
                    if (!Objects.equals(pending.remove(result.id()), result.name())) throw new IllegalArgumentException("AI_TOOL_HISTORY_INVALID");
                    input.add(ResponseInputItem.ofFunctionCallOutput(ResponseInputItem.FunctionCallOutput.builder()
                            .callId(result.id()).output(result.responseData()).build()));
                }
                continue;
            }
            switch (message.getMessageType()) {
                case SYSTEM -> instructions.append(message.getText()).append('\n');
                case USER, ASSISTANT -> input.add(ResponseInputItem.ofEasyInputMessage(EasyInputMessage.builder()
                        .role(message.getMessageType() == org.springframework.ai.chat.messages.MessageType.USER ? EasyInputMessage.Role.USER : EasyInputMessage.Role.ASSISTANT)
                        .content(message.getText() == null ? "" : message.getText()).build()));
                default -> throw new IllegalArgumentException("AI_PROTOCOL_TOOLS_UNAVAILABLE");
            }
        }
        if (!pending.isEmpty()) throw new IllegalArgumentException("AI_TOOL_HISTORY_INCOMPLETE");
        var params = ResponseCreateParams.builder().model(model).store(false).inputOfResponse(input).instructions(instructions.toString());
        if (prompt.getOptions() != null && prompt.getOptions().getMaxTokens() != null)
            params.maxOutputTokens(prompt.getOptions().getMaxTokens());
        if (prompt.getOptions() instanceof ToolCallingChatOptions tools) {
            if (tools.getToolCallbacks() != null && !tools.getToolCallbacks().isEmpty()) {
                params.parallelToolCalls(false).addInclude(ResponseIncludable.REASONING_ENCRYPTED_CONTENT);
                var names = new HashSet<String>();
                for (var callback : tools.getToolCallbacks()) {
                    var definition = callback.getToolDefinition();
                    if (!names.add(definition.name())) throw new IllegalArgumentException("AI_TOOL_NAME_DUPLICATE");
                    var schema = JSON.readValue(definition.inputSchema(), Map.class);
                    var parameters = FunctionTool.Parameters.builder();
                    schema.forEach((key, value) -> parameters.putAdditionalProperty(key.toString(), com.openai.core.JsonValue.from(value)));
                    params.addTool(FunctionTool.builder().name(definition.name()).description(definition.description())
                            .parameters(parameters.build()).strict(false).build());
                }
            }
        }
        if (prompt.getOptions() instanceof org.springframework.ai.openai.OpenAiChatOptions options && options.getReasoningEffort() != null)
            params.reasoning(com.openai.models.Reasoning.builder().effort(com.openai.models.ReasoningEffort.of(options.getReasoningEffort())).build());
        return params.build();
    }
}
