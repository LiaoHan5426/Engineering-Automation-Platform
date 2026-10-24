package com.lh.eap.ai;

import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class EngineeringAiConfiguration {
    @Bean
    static BeanFactoryPostProcessor legacyModelConfigurationGuard(Environment environment) {
        return factory -> {
            if (environment.getProperty("spring.ai.model.chat", "none").equals("openai")
                    && !com.lh.eap.llm.EndpointPolicy.permits(
                            environment.getProperty("spring.ai.openai.base-url", "https://api.openai.com"), true))
                throw new IllegalStateException("Spring AI endpoint requires HTTPS or an HTTP loopback host, without userinfo");
            var obsolete = java.util.Map.of(
                    "eap.llm.base-url", "EAP_LLM_BASE_URL", "eap.llm.model", "EAP_LLM_MODEL",
                    "eap.llm.connect-timeout-ms", "EAP_LLM_CONNECT_TIMEOUT_MS",
                    "eap.llm.read-timeout-ms", "EAP_LLM_READ_TIMEOUT_MS",
                    "eap.llm.allow-remote", "EAP_LLM_ALLOW_REMOTE");
            var found = obsolete.entrySet().stream()
                    .filter(entry -> environment.containsProperty(entry.getKey()) || environment.containsProperty(entry.getValue()))
                    .map(java.util.Map.Entry::getKey).sorted().toList();
            if (found.isEmpty()) return;
            String message = "Legacy model connection properties require Spring AI migration: " + String.join(", ", found)
                    + "; use spring.ai.* / EAP_AI_PROVIDER, EAP_AI_BASE_URL, EAP_AI_MODEL, OPENAI_API_KEY";
            boolean enabled = environment.getProperty("eap.llm.enabled", Boolean.class, false)
                    || !environment.getProperty("spring.ai.model.chat", "none").equals("none");
            if (enabled) throw new IllegalStateException(message);
            org.slf4j.LoggerFactory.getLogger(EngineeringAiConfiguration.class).warn(message);
        };
    }
    @Bean
    ChatMemory engineeringChatMemory() {
        return MessageWindowChatMemory.builder().maxMessages(20).build();
    }

    @Bean
    EngineeringChatService engineeringChatService(ObjectProvider<ChatClient.Builder> builders, ObjectProvider<ChatModel> models,
            ChatMemory memory, CapabilityHandlerRegistry registry,
            @Value("${spring.ai.model.chat:none}") String provider,
            @Value("${spring.ai.openai.api-key:}") String apiKey,
            @Value("${eap.ai.authorized-root:}") String root,
            @Value("${eap.ai.artifact-root:.eap-ai-artifacts}") String artifactRoot) {
        if (provider.equals("openai") && apiKey.isBlank())
            throw new IllegalStateException("OpenAI configuration requires spring.ai.openai.api-key / OPENAI_API_KEY");
        var builder = models.getIfAvailable() == null ? null : builders.getIfAvailable();
        var client = builder == null ? null : createClient(builder, memory);
        return new EngineeringChatService(client, registry, root.isBlank() ? null : Path.of(root),
                new FileExecutionArtifactStore(Path.of(artifactRoot)));
    }

    static ChatClient createClient(ChatClient.Builder builder, ChatMemory memory) {
        return builder.defaultAdvisors(MessageChatMemoryAdvisor.builder(memory).build(),
                ToolCallingAdvisor.builder().toolCallingManager(ToolCallingManager.builder()
                        .maxCallsPerTool(4).maxTotalToolCalls(4).resolutionFallbackEnabled(false).build()).build()).build();
    }
}
