package com.lh.eap.ai;

import com.openai.client.OpenAIClient;
import com.openai.client.OpenAIClientImpl;
import com.openai.core.ClientOptions;
import com.openai.models.responses.*;
import java.time.Duration;
import java.util.*;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.openai.http.okhttp.SpringAiOpenAiHttpClient;

/** Text-only Responses transport shared by API-key and ChatGPT-plan connections; no OAuth or tool loop. */
class OpenAiResponsesChatModel implements ChatModel {
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
        if (prompt.getOptions() instanceof ToolCallingChatOptions tools && tools.getToolCallbacks() != null && !tools.getToolCallbacks().isEmpty())
            throw new IllegalArgumentException("AI_PROTOCOL_TOOLS_UNAVAILABLE");
        var params = parameters(prompt, model);
        StringBuilder output = new StringBuilder(); boolean completed = false;
        try (var events = client.responses().createStreaming(params)) {
            var iterator = events.stream().iterator();
            while (iterator.hasNext()) {
                var event = iterator.next();
                if (event.outputTextDelta().isPresent()) output.append(event.outputTextDelta().get().delta());
                if (output.length() > 256000) throw new IllegalStateException("AI_RESPONSE_OUTPUT_LIMIT");
                if (event.failed().isPresent() || event.error().isPresent() || event.incomplete().isPresent())
                    throw new IllegalStateException("AI_RESPONSE_FAILED");
                if (event.completed().isPresent()) { completed = true; break; }
            }
        }
        if (!completed) throw new IllegalStateException("AI_RESPONSE_INCOMPLETE");
        return new ChatResponse(List.of(new Generation(new AssistantMessage(output.toString()))));
    }

    static ResponseCreateParams parameters(Prompt prompt, String model) {
        var input = new ArrayList<ResponseInputItem>(); var instructions = new StringBuilder();
        for (var message : prompt.getInstructions()) {
            if (message instanceof AssistantMessage assistant && !assistant.getToolCalls().isEmpty())
                throw new IllegalArgumentException("AI_PROTOCOL_TOOLS_UNAVAILABLE");
            switch (message.getMessageType()) {
                case SYSTEM -> instructions.append(message.getText()).append('\n');
                case USER, ASSISTANT -> input.add(ResponseInputItem.ofEasyInputMessage(EasyInputMessage.builder()
                        .role(message.getMessageType() == org.springframework.ai.chat.messages.MessageType.USER ? EasyInputMessage.Role.USER : EasyInputMessage.Role.ASSISTANT)
                        .content(message.getText() == null ? "" : message.getText()).build()));
                default -> throw new IllegalArgumentException("AI_PROTOCOL_TOOLS_UNAVAILABLE");
            }
        }
        var params = ResponseCreateParams.builder().model(model).store(false).inputOfResponse(input).instructions(instructions.toString());
        if (prompt.getOptions() instanceof org.springframework.ai.openai.OpenAiChatOptions options && options.getReasoningEffort() != null)
            params.reasoning(com.openai.models.Reasoning.builder().effort(com.openai.models.ReasoningEffort.of(options.getReasoningEffort())).build());
        return params.build();
    }
}
