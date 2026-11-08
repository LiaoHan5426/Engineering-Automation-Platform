package com.lh.eap.spring;

import com.lh.eap.application.service.WorkspaceFilesService;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.Path;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

@AutoConfiguration(after = EapCoreAutoConfiguration.class)
@ConditionalOnClass(RuntimeWorkspace.class)
@ConditionalOnProperty(name = "eap.local.enabled", matchIfMissing = true)
public class EapLocalAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    com.lh.eap.local.CliChannelStore cliChannelStore() {
        return com.lh.eap.local.CliChannelStore.readOnlyDefaults();
    }
    @Bean
    @ConditionalOnMissingBean
    com.lh.eap.application.service.CliChannels cliChannels(com.lh.eap.local.CliChannelStore store,
            org.springframework.beans.factory.ObjectProvider<com.lh.eap.api.ProcessExecutor> executor) {
        return new com.lh.eap.application.service.CliChannels(store, executor.getIfAvailable());
    }

    @Bean
    @ConditionalOnMissingBean
    RuntimeWorkspace runtimeWorkspace(Environment environment) {
        // Library inclusion never grants filesystem access; the embedding application supplies the root.
        var workspace = Path.of(environment.getProperty("eap.local.workspace", System.getProperty("user.dir")))
                .toAbsolutePath().normalize();
        return new RuntimeWorkspace(workspace,
                environment.getProperty("eap.runtime.authorized-root", ""),
                environment.getProperty("eap.ai.authorized-root", ""));
    }
    @Bean
    @ConditionalOnMissingBean
    WorkspaceFilesService workspaceFilesService(RuntimeWorkspace workspace) {
        return new WorkspaceFilesService(workspace);
    }
}
