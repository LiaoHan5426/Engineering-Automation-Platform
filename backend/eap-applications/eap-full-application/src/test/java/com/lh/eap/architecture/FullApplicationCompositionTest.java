package com.lh.eap.architecture;

import com.lh.eap.config.FullApplicationConfiguration;
import com.lh.eap.spring.*;
import com.lh.eap.core.DefaultProcessExecutor;
import com.lh.eap.web.controller.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import java.nio.file.Path;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/** Real application bean graph, isolated storage/transactions; runners and live services are not executed. */
class FullApplicationCompositionTest {
    @TempDir Path directory;
    @Test void applicationEntryPointDiscoversAutoConfigurationsAndKeepsProductRegistry() {
        new WebApplicationContextRunner()
                .withAllowBeanDefinitionOverriding(false)
                .withUserConfiguration(com.lh.eap.EapApplication.class)
                .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
                .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
                .withPropertyValues(
                        "spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
                        "spring.flyway.enabled=false", "spring.jmx.enabled=false",
                        "spring.ai.model.chat=none", "spring.ai.model.embedding=none",
                        "spring.ai.model.image=none", "spring.ai.model.audio.speech=none",
                        "spring.ai.model.audio.transcription=none", "spring.ai.model.moderation=none",
                        "eap.ai.connection-store=" + directory.resolve("connections.json"),
                        "eap.ai.artifact-root=" + directory.resolve("artifacts"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(com.lh.eap.runtime.handler.CapabilityHandlerRegistry.class);
                    assertThat(context).hasSingleBean(com.lh.eap.local.CliChannelStore.class);
                    assertThat(context.getBean(com.lh.eap.local.CliChannelStore.class))
                            .isInstanceOf(com.lh.eap.application.service.JdbcCliChannelStore.class);
                    assertThat(context).hasSingleBean(com.lh.eap.delivery.PrototypeVersionQuery.class);
                    assertThat(context).hasSingleBean(com.lh.eap.core.ExpertAnalysisPolicyResolver.class);
                    assertThat(context).hasSingleBean(com.lh.eap.core.ExpertAgentAccess.class)
                            .hasSingleBean(com.lh.eap.ai.SqlExpertAgentService.class)
                            .hasSingleBean(com.lh.eap.ai.SqlExpertAgentScheduler.class)
                            .hasSingleBean(com.lh.eap.web.controller.ExpertAgentQueueController.class)
                            .hasSingleBean(com.lh.eap.web.controller.SqlExpertAgentController.class);
                    assertThat(context.getBean(com.lh.eap.core.ExpertAnalysisPolicyResolver.class).behaviors())
                            .anyMatch(item -> item.binding().equals(com.lh.eap.ai.SqlExpertAgentService.BINDING)
                                    && item.executionMode().equals("agent") && item.requiredTools().contains("sql.parse"));
                    var fixedExpert = new com.lh.eap.domain.model.ExpertManifest("eap/v1", "Expert", "sql-expert", "SQL",
                            java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(), java.util.List.of(), new com.lh.eap.domain.model.ExpertBehaviorBinding("sql-analysis", 1));
                    assertThat(context.getBean(com.lh.eap.core.ExpertAnalysisPolicyResolver.class).resolve(fixedExpert))
                            .contains(context.getBean(com.lh.eap.application.service.SqlExpertAnalysisPolicy.class));
                    assertThat(context).hasSingleBean(com.lh.eap.rules.RulePackQuery.class);
                    assertThat(context.getBean(com.lh.eap.rules.RulePackQuery.class))
                            .isSameAs(context.getBean(com.lh.eap.rules.RulePackService.class));
                    assertThat(context).hasSingleBean(com.lh.eap.core.ExpertScopedCapabilityQuery.class);
                    assertThat(context.getBean(com.lh.eap.core.ExpertScopedCapabilityQuery.class))
                            .isSameAs(context.getBean(com.lh.eap.persistence.mapper.McpServerRegistry.class));
                    assertThat(org.springframework.test.util.ReflectionTestUtils.getField(
                            context.getBean(com.lh.eap.application.service.ExpertDefinitionService.class), "settings"))
                            .isSameAs(context.getBean(com.lh.eap.application.service.CapabilitySettings.class));
                    assertThat(org.springframework.test.util.ReflectionTestUtils.getField(
                            context.getBean(com.lh.eap.ai.AiChatApplication.class), "prototypes"))
                            .isSameAs(context.getBean(com.lh.eap.application.service.PrototypeVersionService.class));
                    var definition = context.getBeanFactory().getBeanDefinition("capabilityHandlerRegistry");
                    assertThat(context.getBeanFactory().getType(definition.getFactoryBeanName()))
                            .isEqualTo(FullApplicationConfiguration.class);
                    assertThat(context.getBeansOfType(DefaultProcessExecutor.class))
                            .containsOnlyKeys("processExecutor", "boardVerificationProcessExecutor");
                    assertThat(context).hasSingleBean(WorkspaceFilesController.class)
                            .hasSingleBean(BoardRuntimeController.class)
                            .hasSingleBean(com.lh.eap.application.service.BoardRuntimeService.class);
                });
    }

    @Test void fullProductResolvesExplicitComponentsAndDistinctExecutors() {
        com.lh.eap.core.ExpertAnalysisPolicyResolver customPolicies = expert -> java.util.Optional.empty();
        new WebApplicationContextRunner()
                .withAllowBeanDefinitionOverriding(false)
                .withUserConfiguration(FullApplicationConfiguration.class)
                .withBean(com.lh.eap.core.ExpertAnalysisPolicyResolver.class, () -> customPolicies)
                .withConfiguration(AutoConfigurations.of(EapCoreAutoConfiguration.class, EapLocalAutoConfiguration.class,
                        EapChatAutoConfiguration.class, EapWebAutoConfiguration.class))
                .withBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class))
                .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
                .withPropertyValues("spring.ai.model.chat=none", "eap.ai.connection-store=" + directory.resolve("connections.json"),
                        "eap.ai.artifact-root=" + directory.resolve("artifacts"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).hasSingleBean(com.lh.eap.core.ExpertAnalysisPolicyResolver.class);
                    assertThat(context.getBean(com.lh.eap.core.ExpertAnalysisPolicyResolver.class)).isSameAs(customPolicies);
                    assertThat(org.springframework.test.util.ReflectionTestUtils.getField(
                            context.getBean(com.lh.eap.application.service.ExpertExecutionService.class), "policies"))
                            .isSameAs(customPolicies);
                    assertThat(context).hasSingleBean(AiChatController.class).hasSingleBean(WorkspaceFilesController.class)
                            .hasSingleBean(McpManagementController.class).hasSingleBean(CapabilityManagementController.class)
                            .hasSingleBean(BoardDeliveryController.class).hasSingleBean(KnowledgeController.class)
                            .hasSingleBean(BoardRuntimeController.class)
                            .hasSingleBean(com.lh.eap.application.service.BoardRuntimeService.class);
                    assertThat(context.getBeansOfType(DefaultProcessExecutor.class)).containsOnlyKeys("processExecutor", "boardVerificationProcessExecutor");
                    assertThat(context.getBean("processExecutor")).isNotSameAs(context.getBean("boardVerificationProcessExecutor"));
                });
    }
}
