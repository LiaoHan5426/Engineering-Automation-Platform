package com.lh.eap.spring;
import com.lh.eap.ai.ChatClients;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.Bean;

@AutoConfiguration(afterName = "org.springframework.ai.model.chat.client.autoconfigure.ChatClientAutoConfiguration")
@ConditionalOnClass(ChatClients.class)
@ConditionalOnProperty(name = "eap.chat.enabled", matchIfMissing = true)
public class EapChatAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    ChatMemory engineeringChatMemory() { return MessageWindowChatMemory.builder().maxMessages(20).build(); }
    @Bean
    @ConditionalOnBean(ChatModel.class)
    @ConditionalOnMissingBean
    ChatClient chatClient(ChatModel model, ChatMemory memory) {
        return ChatClients.createClient(ChatClient.builder(model), memory);
    }
}
