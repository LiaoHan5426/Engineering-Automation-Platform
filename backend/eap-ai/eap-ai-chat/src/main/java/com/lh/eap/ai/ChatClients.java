package com.lh.eap.ai;
import java.util.UUID;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;

/** Shared bounded Spring AI client setup; no product or provider dependencies. */
public final class ChatClients {
    private ChatClients() {}
    public static ChatClient createClient(ChatClient.Builder builder, ChatMemory memory) {
        return builder.defaultAdvisors(MessageChatMemoryAdvisor.builder(memory).build(),
                ToolCallingAdvisor.builder().toolCallingManager(ToolCallingManager.builder()
                        .maxCallsPerTool(4).maxTotalToolCalls(4).resolutionFallbackEnabled(false).build()).build()).build();
    }
    public static String memoryKey(String principal, UUID conversationId) {
        return principal.length() + ":" + principal + ":" + conversationId;
    }
}
