package com.lh.eap.ai;

import java.util.List;
import java.util.function.Function;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.*;
import org.springframework.ai.model.tool.ToolCallingChatOptions;

/** Offline fixture at Spring AI's public model boundary; no HTTP server or protocol emulation. */
public final class FakeChatModels {
    private FakeChatModels() {}
    public static ChatModel scripted(Function<Prompt, ChatResponse> script) {
        return new ChatModel() {
            @Override public ChatResponse call(Prompt prompt) { return script.apply(prompt); }
            @Override public ChatOptions getOptions() { return ToolCallingChatOptions.builder().build(); }
        };
    }
    public static ChatResponse text(String content) {
        return new ChatResponse(List.of(new Generation(new AssistantMessage(content))));
    }
    public static com.lh.eap.llm.OpenAiCompatibleProvider sqlBridge(ChatModel model) {
        var beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
        if (model != null) {
            beans.registerSingleton("model", model);
            beans.registerSingleton("builder", org.springframework.ai.chat.client.ChatClient.builder(model));
        }
        return new com.lh.eap.llm.OpenAiCompatibleProvider(
                beans.getBeanProvider(org.springframework.ai.chat.client.ChatClient.Builder.class),
                beans.getBeanProvider(ChatModel.class), true, "offline-model", "https://api.openai.com");
    }
}
