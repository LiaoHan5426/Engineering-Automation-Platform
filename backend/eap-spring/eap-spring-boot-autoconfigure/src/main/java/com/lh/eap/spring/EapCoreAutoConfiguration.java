package com.lh.eap.spring;
import com.lh.eap.core.CapabilitySwitches;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.core.DefaultProcessExecutor;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@AutoConfiguration
@ConditionalOnClass(DefaultProcessExecutor.class)
@ConditionalOnProperty(name = "eap.core.enabled", matchIfMissing = true)
public class EapCoreAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    CapabilityHandlerRegistry capabilityHandlerRegistry(
            List<CapabilityHandler> handlers,
            ObjectProvider<CapabilitySwitches> switches) {
        return new CapabilityHandlerRegistry(handlers,
                switches.getIfAvailable(() -> capability -> false));
    }

    @Bean(destroyMethod = "close")
    @Primary
    @ConditionalOnMissingBean(value = ProcessExecutor.class, name = "processExecutor")
    DefaultProcessExecutor processExecutor() { return new DefaultProcessExecutor(); }
}
