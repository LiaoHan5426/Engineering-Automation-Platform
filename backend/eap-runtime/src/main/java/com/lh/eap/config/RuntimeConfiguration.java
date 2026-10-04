package com.lh.eap.config;

import com.lh.eap.capability.*;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.DefaultProcessExecutor;
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

    @Bean
    CapabilityRegistry capabilityRegistry() {
        return new CapabilityRegistry().register(new GitCapability("status")).register(new GitCapability("diff")).register(new RipgrepCapability());
    }
}
