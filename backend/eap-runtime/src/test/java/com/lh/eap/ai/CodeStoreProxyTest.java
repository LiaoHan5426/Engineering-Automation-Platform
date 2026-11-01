package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;

class CodeStoreProxyTest {
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
