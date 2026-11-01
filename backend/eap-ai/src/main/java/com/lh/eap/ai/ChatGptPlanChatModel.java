package com.lh.eap.ai;

import com.openai.client.OpenAIClient;
import com.openai.client.OpenAIClientImpl;
import com.openai.core.ClientOptions;
import org.springframework.ai.openai.http.okhttp.SpringAiOpenAiHttpClient;
import com.openai.models.responses.*;
import java.time.Duration;
import java.util.*;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.model.tool.ToolCallingChatOptions;

/** Narrow Responses transport adapter for Spring AI 2.0.2. Memory and orchestration remain in Spring AI. */
final class ChatGptPlanChatModel implements ChatModel {
    private final OpenAIClient client;
    private final String model;
    ChatGptPlanChatModel(ModelConnectionSnapshot snapshot) {
        this(new OpenAIClientImpl(ClientOptions.builder().apiKey(snapshot.secret).baseUrl(snapshot.baseUrl)
                .httpClient(SpringAiOpenAiHttpClient.builder().timeout(Duration.ofSeconds(45)).build())
                .timeout(Duration.ofSeconds(45)).maxRetries(0).build()), snapshot.model);
    }
    ChatGptPlanChatModel(OpenAIClient client, String model) { this.client = client; this.model = model; }
    @Override public ChatResponse call(Prompt prompt) {
        if (prompt.getOptions() instanceof ToolCallingChatOptions tools && tools.getToolCallbacks() != null && !tools.getToolCallbacks().isEmpty())
            throw new IllegalArgumentException("CHATGPT_PLAN_TOOLS_UNAVAILABLE");
        var params = parameters(prompt, model);
        StringBuilder output = new StringBuilder(); boolean completed = false;
        try (var events = client.responses().createStreaming(params)) {
            var iterator = events.stream().iterator();
            while (iterator.hasNext()) {
                var event = iterator.next();
                if (event.outputTextDelta().isPresent()) output.append(event.outputTextDelta().get().delta());
                if (output.length() > 256000) throw new IllegalStateException("CHATGPT_OUTPUT_LIMIT");
                if (event.failed().isPresent() || event.error().isPresent() || event.incomplete().isPresent())
                    throw new IllegalStateException("CHATGPT_RESPONSE_FAILED");
                if (event.completed().isPresent()) { completed = true; break; }
            }
        }
        if (!completed) throw new IllegalStateException("CHATGPT_RESPONSE_INCOMPLETE");
        return new ChatResponse(List.of(new Generation(new AssistantMessage(output.toString()))));
    }
    static ResponseCreateParams parameters(Prompt prompt, String model) {
        var input = new ArrayList<ResponseInputItem>(); var instructions = new StringBuilder();
        for (var message : prompt.getInstructions()) {
            switch (message.getMessageType()) {
                case SYSTEM -> instructions.append(message.getText()).append('\n');
                case USER, ASSISTANT -> input.add(ResponseInputItem.ofEasyInputMessage(EasyInputMessage.builder()
                        .role(message.getMessageType() == org.springframework.ai.chat.messages.MessageType.USER ? EasyInputMessage.Role.USER : EasyInputMessage.Role.ASSISTANT)
                        .content(message.getText() == null ? "" : message.getText()).build()));
                default -> throw new IllegalArgumentException("CHATGPT_PLAN_TOOLS_UNAVAILABLE");
            }
        }
        var params = ResponseCreateParams.builder().model(model).store(false).inputOfResponse(input).instructions(instructions.toString());
        if (prompt.getOptions() instanceof org.springframework.ai.openai.OpenAiChatOptions options && options.getReasoningEffort() != null)
            params.reasoning(com.openai.models.Reasoning.builder().effort(com.openai.models.ReasoningEffort.of(options.getReasoningEffort())).build());
        return params.build();
    }
}
