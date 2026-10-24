package com.lh.eap.ai;

import java.time.Duration;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.stereotype.Component;

/** One new OpenAI-compatible client per connection revision. An existing client is never reconfigured. */
@Component
public final class SpringAiModelClientSource implements ModelClientSource {
    private final ChatMemory memory;

    public SpringAiModelClientSource(ChatMemory memory) {
        this.memory = memory;
    }

    @Override
    public ChatClient conversational(ModelConnectionSnapshot snapshot) {
        return EngineeringAiConfiguration.createClient(ChatClient.builder(model(snapshot)), memory);
    }

    @Override
    public ChatClient completion(ModelConnectionSnapshot snapshot) {
        return ChatClient.builder(model(snapshot)).build();
    }

    private static OpenAiChatModel model(ModelConnectionSnapshot snapshot) {
        var options = OpenAiChatOptions.builder().baseUrl(snapshot.baseUrl).apiKey(snapshot.secret)
                .timeout(Duration.ofSeconds(30)).maxRetries(0);
        options.model(snapshot.model);
        return OpenAiChatModel.builder().options(options.build()).build();
    }
}
