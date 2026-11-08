package com.lh.eap.architecture;

import com.lh.eap.application.service.*;
import com.lh.eap.core.CapabilityUsageQuery;
import com.lh.eap.persistence.mapper.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Service calls without HTTP still own the transaction; no real datasource or schema changes. */
class ManagementTransactionBoundaryTest {
    static class Transactions extends AbstractPlatformTransactionManager {
        int committed, rolledBack;
        protected Object doGetTransaction() { return new Object(); }
        protected void doBegin(Object transaction, TransactionDefinition definition) {}
        protected void doCommit(DefaultTransactionStatus status) { committed++; }
        protected void doRollback(DefaultTransactionStatus status) { rolledBack++; }
    }
    @SuppressWarnings("unchecked")
    static <T> T transactional(T target, Transactions manager) {
        var proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (T) proxy.getProxy();
    }
    @Test void cliAndCapabilityWritesOpenTransactionsWithoutControllers() {
        var transactions = new Transactions();
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.update(anyString(), any(Object[].class))).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive()); return 1;
        });
        var usage = mock(CapabilityUsageQuery.class);
        when(usage.enabledExpertsUsing("git.diff")).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive()); return List.of();
        });
        transactional(new CapabilitySettings(jdbc, usage), transactions).save("git.diff", false, "disabled");
        new CliChannels(transactional(new JdbcCliChannelStore(jdbc), transactions)).configure("git", "git");
        assertEquals(2, transactions.committed);
        assertEquals(0, transactions.rolledBack);
    }
    @Test void mcpActivationReadsAndUpdatesInOneTransactionPreservingUnspecifiedFlags() {
        var transactions = new Transactions();
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString())).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            return List.of(Map.<String,Object>of("id", "server", "name", "Server", "transport", "http",
                    "endpoint", "http://127.0.0.1:9000/mcp", "trusted", true, "enabled", true, "tools", "[]"));
        });
        when(jdbc.update(anyString(), any(Object[].class))).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive()); return 1;
        });
        var service = transactional(new McpServerService(jdbc, mock(McpServerRegistry.class), mock(CapabilityUsageQuery.class)), transactions);
        assertEquals(Map.of("id", "server", "enabled", false, "trusted", true), service.activate("server", false, null));
        assertEquals(1, transactions.committed);
        verify(jdbc).update(contains("INSERT INTO eap.mcp_server"), eq("server"), eq("Server"), eq("http"),
                eq("http://127.0.0.1:9000/mcp"), eq(true), eq(false), eq("[]"));
    }
    @Test void failedGrantCleanupRollsBackServerDeletionForNonHttpCallers() {
        var transactions = new Transactions();
        var jdbc = mock(JdbcTemplate.class);
        var registry = mock(McpServerRegistry.class);
        when(registry.grantsByCapability()).thenReturn(Map.of("mcp.server.tool", List.of("draft")));
        when(jdbc.update(anyString(), any(Object[].class))).thenAnswer(call -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            if (call.<String>getArgument(0).contains("expert_mcp_grant")) throw new IllegalStateException("storage failure");
            return 1;
        });
        var service = transactional(new McpServerService(jdbc, registry, mock(CapabilityUsageQuery.class)), transactions);
        assertThrows(IllegalStateException.class, () -> service.delete("server"));
        verify(jdbc).update("DELETE FROM eap.mcp_server WHERE id=?", "server");
        assertEquals(0, transactions.committed);
        assertEquals(1, transactions.rolledBack);
    }
    @Test void workflowAuthorizationAdapterRequiresTheCallersTransaction() {
        var definitions = mock(ExpertDefinitionMapper.class);
        var experts = mock(ExpertDefinitionService.class);
        var access = transactional(new WorkflowExpertKnowledgeAccess(definitions, experts), new Transactions());
        assertThrows(IllegalTransactionStateException.class, () -> access.lockForKnowledge("reader"));
        assertThrows(IllegalTransactionStateException.class, () -> access.knowledgeGrants("reader"));
        verifyNoInteractions(definitions, experts);
    }
}
