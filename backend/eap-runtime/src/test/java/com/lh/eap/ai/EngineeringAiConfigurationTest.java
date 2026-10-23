package com.lh.eap.ai;

import static org.assertj.core.api.Assertions.assertThat;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatAutoConfiguration;
import org.springframework.ai.model.tool.autoconfigure.ToolCallingAutoConfiguration;
import org.springframework.ai.model.chat.client.autoconfigure.ChatClientAutoConfiguration;
import org.springframework.ai.chat.model.ChatModel;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;

class EngineeringAiConfigurationTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(OpenAiChatAutoConfiguration.class,
                    ToolCallingAutoConfiguration.class, ChatClientAutoConfiguration.class))
            .withUserConfiguration(EngineeringAiConfiguration.class)
            .withBean(CapabilityHandlerRegistry.class, () -> new CapabilityHandlerRegistry(List.of()));

    @Test void disabledProviderStartsWithoutCredentials() {
        context.withPropertyValues("spring.ai.model.chat=none").run(c -> {
            assertThat(c).hasNotFailed().doesNotHaveBean(ChatModel.class).hasSingleBean(EngineeringChatService.class);
        });
    }
    @Test void enabledOpenAiWithoutKeyFailsConfigurationWithoutCallingNetwork() {
        context.withPropertyValues("spring.ai.model.chat=openai", "spring.ai.openai.api-key=",
                "spring.ai.openai.chat.api-key=").run(c -> assertThat(c).hasFailed());
    }
    @Test void officialProviderAndServiceConstructWithoutCallingNetwork() {
        context.withPropertyValues("spring.ai.model.chat=openai", "spring.ai.openai.api-key=offline-placeholder",
                "spring.ai.openai.chat.options.model=offline-model").run(c -> {
            assertThat(c).hasNotFailed().hasSingleBean(ChatModel.class).hasSingleBean(EngineeringChatService.class);
        });
    }
    @Test void obsoleteConnectionPropertiesAreRejectedWhenModelUseIsRequested() {
        context.withPropertyValues("spring.ai.model.chat=none", "eap.llm.enabled=true",
                "EAP_LLM_BASE_URL=http://legacy.invalid", "EAP_LLM_MODEL=legacy")
                .run(c -> {
                    assertThat(c).hasFailed();
                    assertThat(c.getStartupFailure()).hasMessageContaining("Legacy model connection properties");
                    assertThat(c.getStartupFailure()).hasMessageNotContaining("legacy.invalid");
                });
    }
    @Test void oldSqlEnableFlagWithoutChatModelDoesNotBreakNonAiStartup() {
        context.withBean(com.lh.eap.llm.OpenAiCompatibleProvider.class)
                .withPropertyValues("spring.ai.model.chat=none", "eap.llm.enabled=true").run(c -> {
                    assertThat(c).hasNotFailed();
                    assertThat(c.getBean(com.lh.eap.llm.OpenAiCompatibleProvider.class).available()).isFalse();
                });
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({
            "http://127.0.0.1:1234/v1,true", "http://localhost:1234/v1,true",
            "http://api.example.com/v1,false", "https://api.example.com/v1,true",
            "https://user:pass@api.example.com/v1,false", "not-a-url,false"})
    void springAiEndpointValidationPreservesTransportSafety(String endpoint, boolean accepted) {
        context.withPropertyValues("spring.ai.model.chat=openai", "spring.ai.openai.api-key=offline-placeholder",
                "spring.ai.openai.base-url=" + endpoint).run(c -> {
                    if (accepted) assertThat(c).hasNotFailed(); else assertThat(c).hasFailed();
                });
    }
}
