package com.lh.eap.ai;
import com.lh.eap.delivery.CodeProposalStore;
import com.lh.eap.delivery.CodeGenerationStoreAdapter;
import com.lh.eap.delivery.CodeProposalStoreAdapter;
import com.lh.eap.persistence.jdbc.JdbcCodeGenerationStore;
import com.lh.eap.persistence.jdbc.JdbcCodeProposalStore;
import com.lh.eap.persistence.jdbc.JdbcWorkspaceLockStore;
import com.lh.eap.delivery.CodeGenerationStore;

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
            context.registerBean(com.lh.eap.core.PrototypeVersionStore.class,
                    () -> mock(com.lh.eap.core.PrototypeVersionStore.class));
            context.registerBean(com.lh.eap.application.service.BoardApplicationBaseline.class, () -> mock(com.lh.eap.application.service.BoardApplicationBaseline.class));
            context.registerBean(com.lh.eap.core.BoardTaskStore.class, () -> mock(com.lh.eap.core.BoardTaskStore.class));
            context.registerBean(com.lh.eap.core.WorkspaceLockStore.class, () -> new JdbcWorkspaceLockStore(context.getBean(JdbcTemplate.class)));
            context.registerBean(com.lh.eap.core.PrototypeVersionQuery.class, () -> mock(com.lh.eap.core.PrototypeVersionQuery.class));
            context.register(com.lh.eap.application.service.WorkspaceInterlock.class,
                    com.lh.eap.application.service.BoardTaskService.class,
                    com.lh.eap.application.service.BoardCodeTaskBinding.class, JdbcCodeGenerationStore.class,
                    JdbcCodeProposalStore.class, CodeGenerationStoreAdapter.class, CodeProposalStoreAdapter.class);
            assertDoesNotThrow(context::refresh);
            assertNotNull(context.getBean(CodeGenerationStore.class));
            assertNotNull(context.getBean(CodeProposalStore.class));
        }
    }
    @Test void repositoryAdaptersSupportSpringClassBasedExceptionTranslationProxies() {
        var jdbc = mock(JdbcTemplate.class);
        var transactions = mock(PlatformTransactionManager.class);
        var locks = new JdbcWorkspaceLockStore(jdbc);
        var generations = new JdbcCodeGenerationStore(jdbc, transactions, locks);
        for (Object adapter : new Object[]{generations, new JdbcCodeProposalStore(jdbc, transactions, locks, generations)}) {
            var factory = new ProxyFactory(adapter);
            factory.setProxyTargetClass(true);
            assertDoesNotThrow(() -> { factory.getProxy(); });
        }
    }
}
