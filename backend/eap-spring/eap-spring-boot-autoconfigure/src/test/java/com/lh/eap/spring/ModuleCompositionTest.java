package com.lh.eap.spring;

import com.lh.eap.application.service.WorkspaceFilesService;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.ai.ChatClients;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.WorkspaceFilesController;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.prompt.*;
import java.nio.file.*;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

class ModuleCompositionTest {
    @TempDir Path root;
    private ApplicationContextRunner local() {
        return new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(
                EapCoreAutoConfiguration.class, EapLocalAutoConfiguration.class));
    }
    @Test void localWorksWithoutDatabaseModelsOrWebAndDeniesImplicitAuthority() throws Exception {
        Files.writeString(root.resolve("sample.txt"), "safe");
        local().withClassLoader(new FilteredClassLoader("org.springframework.ai", "org.springframework.jdbc", "jakarta.servlet"))
                .withPropertyValues("eap.local.workspace=" + root).run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(ProcessExecutor.class).hasSingleBean(WorkspaceFilesService.class);
                    assertThat(context.getBean(WorkspaceFilesService.class).list("").denial()).isEqualTo("AUTHORIZED_ROOT_MISSING");
                });
        local().withPropertyValues("eap.local.workspace=" + root, "eap.runtime.authorized-root=" + root).run(context -> {
            var files = context.getBean(WorkspaceFilesService.class);
            assertThat(files.list("").entries()).extracting(WorkspaceFilesService.Entry::name).containsExactly("sample.txt");
            assertThat(files.list("../").denial()).isEqualTo("INVALID_DIRECTORY_PATH");
        });
        local().withPropertyValues("eap.local.workspace=" + root, "eap.ai.authorized-root=" + root).run(context ->
                assertThat(context.getBean(RuntimeWorkspace.class).root().allowed()).isFalse());
    }
    @Test void consumersOverrideWorkspaceAndExecutor() {
        var workspace = RuntimeWorkspace.colocated(root, "");
        var executor = org.mockito.Mockito.mock(ProcessExecutor.class);
        local().withBean(RuntimeWorkspace.class, () -> workspace).withBean(ProcessExecutor.class, () -> executor)
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(RuntimeWorkspace.class).hasSingleBean(ProcessExecutor.class);
                    assertThat(context.getBean(RuntimeWorkspace.class)).isSameAs(workspace);
                    assertThat(context.getBean(ProcessExecutor.class)).isSameAs(executor);
                });
    }
    @Test void disabledOrAbsentLocalModuleDoesNotCreateFilesService() {
        local().withPropertyValues("eap.local.enabled=false", "eap.core.enabled=false").run(context ->
                assertThat(context).hasNotFailed().doesNotHaveBean(WorkspaceFilesService.class).doesNotHaveBean(ProcessExecutor.class));
        local().withClassLoader(new FilteredClassLoader(RuntimeWorkspace.class)).run(context ->
                assertThat(context).hasNotFailed().doesNotHaveBean("workspaceFilesService"));
    }
    @Test void headlessChatUsesPublicModelInterfaceWithoutProductOrProvider() {
        var model = new ChatModel() {
            public ChatResponse call(Prompt prompt) { return new ChatResponse(List.of(new Generation(new AssistantMessage("offline reply")))); }
            public ChatOptions getOptions() { return org.springframework.ai.model.tool.ToolCallingChatOptions.builder().build(); }
        };
        new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(EapChatAutoConfiguration.class))
                .withClassLoader(new FilteredClassLoader("com.openai", "org.springframework.jdbc", "jakarta.servlet", "com.lh.eap.delivery"))
                .withBean(ChatModel.class, () -> model).run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(ChatClient.class);
                    assertThat(context.getBean(ChatClient.class).prompt().user("hello").advisors(a -> a.param(org.springframework.ai.chat.memory.ChatMemory.CONVERSATION_ID, "test-session")).call().content()).isEqualTo("offline reply");
                });
    }
    @Test void absentChatModuleDoesNotCreateMemoryOrClients() {
        new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(EapChatAutoConfiguration.class))
                .withClassLoader(new FilteredClassLoader(ChatClients.class)).run(context ->
                        assertThat(context).hasNotFailed().doesNotHaveBean("engineeringChatMemory").doesNotHaveBean(ChatClient.class));
    }
    @Test void localHttpHasGuardAndNoOtherDomainControllers() {
        new WebApplicationContextRunner().withConfiguration(AutoConfigurations.of(EapLocalAutoConfiguration.class, EapWebAutoConfiguration.class))
                .withPropertyValues("eap.local.workspace=" + root).run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(WorkspaceFilesController.class).hasSingleBean(AiBrowserRequestGuard.class);
                    assertThat(context.getBeanNamesForAnnotation(org.springframework.web.bind.annotation.RestController.class))
                            .containsExactly("workspaceFilesController");
                    var request = new org.springframework.mock.web.MockHttpServletRequest("GET", "/api/ai/workspace/files");
                    request.setServerName("attacker.example"); request.addHeader("Host", "attacker.example");
                    var response = new org.springframework.mock.web.MockHttpServletResponse();
                    try { context.getBean(AiBrowserRequestGuard.class).doFilter(request, response, new org.springframework.mock.web.MockFilterChain()); }
                    catch (Exception failure) { throw new AssertionError(failure); }
                    assertThat(response.getStatus()).isEqualTo(403);
                });
    }
    @Test void localStarterCreatesReadOnlyCliChannelsWithoutJdbc() {
        local().withClassLoader(new FilteredClassLoader("org.springframework.jdbc", "org.springframework.ai", "jakarta.servlet"))
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(com.lh.eap.application.service.CliChannels.class);
                    var channels = context.getBean(com.lh.eap.application.service.CliChannels.class);
                    assertThat(channels.binaryFor("git-status", "git")).isEqualTo("git");
                    org.assertj.core.api.Assertions.assertThatThrownBy(() -> channels.configure("git", "other"))
                            .isInstanceOf(IllegalStateException.class);
                });
        local().withPropertyValues("eap.local.enabled=false").run(context ->
                assertThat(context).doesNotHaveBean(com.lh.eap.application.service.CliChannels.class)
                        .doesNotHaveBean(com.lh.eap.local.CliChannelStore.class));
    }
    @Test void consumerCliStoreIsUsedAndUserChannelsCanOverrideTheDefault() {
        var store = org.mockito.Mockito.mock(com.lh.eap.local.CliChannelStore.class);
        org.mockito.Mockito.when(store.overrides()).thenReturn(java.util.Map.of("git", "custom-git"));
        local().withBean(com.lh.eap.local.CliChannelStore.class, () -> store).run(context -> {
            assertThat(context).hasSingleBean(com.lh.eap.local.CliChannelStore.class);
            assertThat(context.getBean(com.lh.eap.application.service.CliChannels.class).binaryFor("git-status", "git"))
                    .isEqualTo("custom-git");
        });
        var custom = new com.lh.eap.application.service.CliChannels(store);
        local().withBean(com.lh.eap.application.service.CliChannels.class, () -> custom).run(context ->
                assertThat(context.getBean(com.lh.eap.application.service.CliChannels.class)).isSameAs(custom));
    }

}
