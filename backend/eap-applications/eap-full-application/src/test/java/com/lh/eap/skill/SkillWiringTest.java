package com.lh.eap.skill;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.context.annotation.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.jdbc.core.JdbcTemplate;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;

class SkillWiringTest {
    @TempDir Path root;
    @Configuration(proxyBeanMethods = false)
    @EnableTransactionManagement(proxyTargetClass = true)
    static class Transactions {}
    @Test void productionConstructorsStartWithClassBasedTransactionsWithoutDatabaseOrModel() {
        try (var context = new AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
            context.registerBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class));
            context.registerBean(RuntimeWorkspace.class, () -> RuntimeWorkspace.colocated(root,"",""));
            context.registerBean(CapabilityHandlerRegistry.class, () -> new CapabilityHandlerRegistry(List.of()));
            context.register(Transactions.class, SkillTextParser.class, SkillService.class, SkillController.class);
            assertDoesNotThrow(context::refresh);
            var service = context.getBean(SkillService.class);
            assertTrue(org.springframework.aop.support.AopUtils.isCglibProxy(service));
            assertEquals("good", service.preview(SkillTextParserTest.input("---\nname: good\ndescription: ok\n---\nbody")).id());
            assertNotNull(context.getBean(SkillController.class));
        }
    }
}
