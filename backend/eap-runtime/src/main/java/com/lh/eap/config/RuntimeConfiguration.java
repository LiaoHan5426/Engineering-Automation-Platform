package com.lh.eap.config;

import com.lh.eap.capability.*;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.DefaultProcessExecutor;
import com.lh.eap.web.CliChannels;
import org.springframework.context.annotation.*;
import java.nio.file.*;

@Configuration
public class RuntimeConfiguration {
    @Bean
    ProcessExecutor processExecutor() {
        return new DefaultProcessExecutor();
    }

    @Bean
    Path workspace() {
        var configured = System.getenv("EAP_WORKSPACE");
        if (configured != null && !configured.isBlank()) return Path.of(configured).toAbsolutePath().normalize();
        var current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
        return Files.isDirectory(current.resolve(".git")) ? current : current.getParent();
    }

    /**
     * The local-process capabilities.
     *
     * <p>Each is handed a supplier for its binary rather than a fixed name, so an operator override
     * configured through {@code CliChannels} takes effect on the next execution instead of requiring a
     * restart. The command line and its arguments stay here, in code, because they are part of what the
     * capability means.
     */
    @Bean
    CapabilityRegistry capabilityRegistry(CliChannels channels) {
        return new CapabilityRegistry()
                .register(new GitCapability("status", () -> channels.binaryFor("git-status", "git")))
                .register(new GitCapability("diff", () -> channels.binaryFor("git-diff", "git")))
                .register(new RipgrepCapability(() -> channels.binaryFor("rg-search", "rg")));
    }
}
