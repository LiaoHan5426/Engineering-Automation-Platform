package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

class CodeStoreProxyTest {
    @Test void productionConstructorsResolveTheNarrowTaskFacadeInSpring() {
        try (var context = new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
            context.registerBean(JdbcTemplate.class, () -> mock(JdbcTemplate.class));
            context.registerBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class));
            context.registerBean(com.lh.eap.application.service.PrototypeVersionStore.class,
                    () -> mock(com.lh.eap.application.service.PrototypeVersionStore.class));
            context.register(com.lh.eap.application.service.BoardTaskService.class,
                    com.lh.eap.application.service.BoardCodeTaskBinding.class, JdbcCodeGenerationStore.class, JdbcCodeProposalStore.class);
            assertDoesNotThrow(context::refresh);
            assertNotNull(context.getBean(CodeGenerationStore.class));
            assertNotNull(context.getBean(CodeProposalStore.class));
        }
    }
    @Test void repositoryAdaptersSupportSpringClassBasedExceptionTranslationProxies() {
        var jdbc = mock(JdbcTemplate.class);
        var transactions = mock(PlatformTransactionManager.class);
        for (Object adapter : new Object[]{new JdbcCodeGenerationStore(jdbc, transactions), new JdbcCodeProposalStore(jdbc, transactions)}) {
            var factory = new ProxyFactory(adapter);
            factory.setProxyTargetClass(true);
            assertDoesNotThrow(() -> { factory.getProxy(); });
        }
    }
}
