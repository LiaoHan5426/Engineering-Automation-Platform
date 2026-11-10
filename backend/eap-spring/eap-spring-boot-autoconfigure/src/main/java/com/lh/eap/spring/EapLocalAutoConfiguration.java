package com.lh.eap.spring;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.application.service.CliChannels;
import com.lh.eap.local.CliChannelStore;
import org.springframework.beans.factory.ObjectProvider;

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
    CliChannelStore cliChannelStore() {
        return CliChannelStore.readOnlyDefaults();
    }
    @Bean
    @ConditionalOnMissingBean
    CliChannels cliChannels(CliChannelStore store,
            ObjectProvider<ProcessExecutor> executor) {
        return new CliChannels(store, executor.getIfAvailable());
    }

    @Bean
    @ConditionalOnMissingBean
    RuntimeWorkspace runtimeWorkspace(Environment environment) {
        // Library inclusion never grants filesystem access; the embedding application supplies the root.
        var workspace = Path.of(environment.getProperty("eap.local.workspace", System.getProperty("user.dir")))
                .toAbsolutePath().normalize();
        return new RuntimeWorkspace(workspace,
                environment.getProperty("eap.runtime.authorized-root", ""));
    }
    @Bean
    @ConditionalOnMissingBean
    WorkspaceFilesService workspaceFilesService(RuntimeWorkspace workspace) {
        return new WorkspaceFilesService(workspace);
    }
}
