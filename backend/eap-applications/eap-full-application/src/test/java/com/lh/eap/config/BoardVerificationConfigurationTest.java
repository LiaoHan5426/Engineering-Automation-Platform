package com.lh.eap.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.application.service.CliChannels;
import com.lh.eap.core.DefaultProcessExecutor;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

class BoardVerificationConfigurationTest {
    @Test void dedicatedBoundedExecutorHasSpringLifecycleWithoutChangingExistingExecutorInjection() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(CliChannels.class, () -> mock(CliChannels.class));
            context.register(RuntimeConfiguration.class); context.refresh();
            assertTrue(context.containsBean("boardVerificationProcessExecutor"), "verification executor bean is missing");
            assertInstanceOf(DefaultProcessExecutor.class, context.getBean("boardVerificationProcessExecutor"));
            assertSame(context.getBean("processExecutor"), context.getBean(ProcessExecutor.class));
            assertNotSame(context.getBean("processExecutor"), context.getBean("boardVerificationProcessExecutor"));
            assertEquals("close", context.getBeanFactory().getBeanDefinition("boardVerificationProcessExecutor").getDestroyMethodName());
        }
    }
}
