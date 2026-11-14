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
    public static final int MAX_TOOL_CALLS = 4;
    public static final int MAX_PLAN_UPDATES = 2;
    public static final int MAX_TOOL_CALLS_WITH_PLAN = MAX_TOOL_CALLS + MAX_PLAN_UPDATES;
    private ChatClients() {}
    private static ToolCallingManager boundedManager() {
        var ordinary = ToolCallingManager.builder().maxCallsPerTool(MAX_TOOL_CALLS).maxTotalToolCalls(MAX_TOOL_CALLS).resolutionFallbackEnabled(false).build();
        var normalErrors = new org.springframework.ai.tool.execution.DefaultToolExecutionExceptionProcessor(false);
        var withPlan = ToolCallingManager.builder().maxCallsPerTool(MAX_TOOL_CALLS)
                .maxCallsPerTool("update_execution_plan", MAX_PLAN_UPDATES)
                .maxTotalToolCalls(MAX_TOOL_CALLS_WITH_PLAN).resolutionFallbackEnabled(false)
                .toolExecutionExceptionProcessor(exception -> {
                    if (exception.getToolDefinition().name().equals("update_execution_plan")) throw exception;
                    return normalErrors.process(exception);
                }).build();
        return new ToolCallingManager() {
            public java.util.List<org.springframework.ai.tool.definition.ToolDefinition> resolveToolDefinitions(org.springframework.ai.model.tool.ToolCallingChatOptions options) {
                return ordinary.resolveToolDefinitions(options);
            }
            public org.springframework.ai.model.tool.ToolExecutionResult executeToolCalls(org.springframework.ai.chat.prompt.Prompt prompt, org.springframework.ai.chat.model.ChatResponse response) {
                boolean plan = prompt.getOptions() instanceof org.springframework.ai.model.tool.ToolCallingChatOptions options
                        && options.getToolCallbacks().stream().anyMatch(callback -> callback.getToolDefinition().name().equals("update_execution_plan"));
                return (plan ? withPlan : ordinary).executeToolCalls(prompt, response);
            }
        };
    }
    public static ChatClient createClient(ChatClient.Builder builder, ChatMemory memory) {
        return builder.defaultAdvisors(MessageChatMemoryAdvisor.builder(memory).build(),
                ToolCallingAdvisor.builder().toolCallingManager(boundedManager()).build()).build();
    }
    public static String memoryKey(String principal, UUID conversationId) {
        return principal.length() + ":" + principal + ":" + conversationId;
    }
}
