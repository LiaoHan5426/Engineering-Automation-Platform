package com.lh.eap.application.service;

import com.lh.eap.core.ExpertAnalysisPolicy;
import com.lh.eap.core.ExpertBehaviorCatalog;
import com.lh.eap.domain.model.ExpertBehaviorBinding;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.domain.model.NodeResult;
import com.lh.eap.persistence.mapper.TaskRepository;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Offline proof that the legacy DAG keeps external work outside any transaction. */
class DagExecutionTransactionBoundaryTest {
    static final class Transactions extends AbstractPlatformTransactionManager {
        static final class Tx { boolean active; Tx(boolean active) { this.active = active; } }
        boolean active;
        final java.util.List<Integer> isolationLevels = new java.util.ArrayList<>();
        final java.util.List<Boolean> readOnlyFlags = new java.util.ArrayList<>();
        protected Object doGetTransaction() { return new Tx(active); }
        protected boolean isExistingTransaction(Object tx) { return ((Tx) tx).active; }
        protected void doBegin(Object tx, TransactionDefinition definition) {
            active = true; ((Tx) tx).active = true;
            isolationLevels.add(definition.getIsolationLevel());
            readOnlyFlags.add(definition.isReadOnly());
        }
        protected void doCommit(DefaultTransactionStatus status) {}
        protected void doRollback(DefaultTransactionStatus status) {}
        protected void doCleanupAfterCompletion(Object tx) { active = false; }
    }

    private static ExpertManifest manifest() { return manifest("Local"); }

    private static ExpertManifest manifest(String name) {
        return new ExpertManifest("eap/v1", "Expert", "local", name, List.of(), List.of(),
                List.of(new ExpertManifest.Step("inspect", "Inspect", "local.inspect", true)), List.of(),
                List.of("database.credentials.never-expose"), List.of(), List.of(),
                new ExpertBehaviorBinding("sql-analysis", 1));
    }

    private static ExpertAnalysisPolicy policy() {
        var policy = mock(ExpertAnalysisPolicy.class);
        when(policy.rules(anyList())).thenReturn(new ExpertAnalysisPolicy.Rules(List.of(), List.of()));
        when(policy.allowedFacts()).thenReturn(Set.of("local.checked"));
        when(policy.judge(anyMap(), anyList(), anySet())).thenReturn(Map.of("ruleCapabilities", Map.of()));
        when(policy.summarize(anyList())).thenReturn(List.of());
        when(policy.enhance(any(), anyBoolean(), anyBoolean()))
                .thenReturn(new ExpertAnalysisPolicy.Enhancement(null, "skipped", Map.of()));
        return policy;
    }

    private record Harness(ExpertExecutionService service, TaskRepository tasks,
            AtomicBoolean handlerSawNoTransaction, AtomicBoolean saveSawTransaction) { }

    private static Harness harness(Transactions manager, ExpertDefinitionService definitions) {
        var tasks = mock(TaskRepository.class);
        var handlerSawNoTransaction = new AtomicBoolean(false);
        var saveSawTransaction = new AtomicBoolean(false);

        CapabilityHandler handler = new CapabilityHandler() {
            public Set<String> capabilities() { return Set.of("local.inspect"); }
            public NodeResult handle(com.lh.eap.domain.model.CapabilityContext context) {
                // The slow external call (CLI/MCP/model stand-in) must not hold a DB transaction.
                handlerSawNoTransaction.set(!TransactionSynchronizationManager.isActualTransactionActive());
                context.publish("local.checked", true);
                return new NodeResult(true, false, "checked", Map.of());
            }
        };
        doAnswer(call -> {
            saveSawTransaction.set(TransactionSynchronizationManager.isActualTransactionActive());
            return null;
        }).when(tasks).save(any(), anyString(), anyString(), anyString(), anyString(), anyList());

        var handlers = new CapabilityHandlerRegistry(List.of(handler));
        var catalog = new ExpertBehaviorCatalog(List.of(
                new ExpertBehaviorCatalog.Registration(new ExpertBehaviorBinding("sql-analysis", 1), "SQL", policy())));
        var service = new ExpertExecutionService(definitions, tasks, handlers, catalog,
                Path.of("."), List.of(), manager);
        return new Harness(service, tasks, handlerSawNoTransaction, saveSawTransaction);
    }

    private static ExpertDefinitionService stableDefinitions() {
        var definitions = mock(ExpertDefinitionService.class);
        when(definitions.require("local", true)).thenAnswer(call -> manifest());
        when(definitions.knowledgeGrants("local")).thenReturn(List.of());
        return definitions;
    }

    private static ExpertExecutionService.Request request() {
        return new ExpertExecutionService.Request("select id from users", "inspect", null, null, false, null);
    }

    @Test void externalHandlerRunsOutsideTransactionWhileWriteIsInsideShortTransaction() {
        var manager = new Transactions();
        var h = harness(manager, stableDefinitions());

        var result = h.service().execute("local", request());

        assertEquals("completed", result.get("status"));
        assertTrue(h.handlerSawNoTransaction().get(), "handler must not run in a transaction");
        assertTrue(h.saveSawTransaction().get(), "the commit callback must run in a short transaction");
        verify(h.tasks()).save(any(), eq("inspect"), eq("completed"), eq("accepted"), eq("skipped"), anyList());

        assertEquals(2, manager.isolationLevels.size(), "exactly two bounded transactions");
        assertEquals(TransactionDefinition.ISOLATION_REPEATABLE_READ, manager.isolationLevels.get(0));
        assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED, manager.isolationLevels.get(1));
        assertTrue(manager.readOnlyFlags.get(0), "snapshot transaction is read-only");
        assertFalse(manager.readOnlyFlags.get(1), "commit transaction is writable");
    }

    @Test void definitionChangedDuringGraphRejectsCommitAndNeverWrites() {
        var manager = new Transactions();
        var definitions = mock(ExpertDefinitionService.class);
        when(definitions.require("local", true)).thenReturn(manifest(), manifest("Changed"));
        when(definitions.knowledgeGrants("local")).thenReturn(List.of());
        var h = harness(manager, definitions);

        assertThrows(ResponseStatusException.class, () -> h.service().execute("local", request()));
        verify(h.tasks(), never()).save(any(), anyString(), anyString(), anyString(), anyString(), anyList());
    }

    @Test void unmanagedConstructionStillRunsDirectlyWithoutTransaction() {
        var h = harness(null, stableDefinitions());
        var result = h.service().execute("local", request());
        assertEquals("completed", result.get("status"));
        assertTrue(h.handlerSawNoTransaction().get());
        assertFalse(h.saveSawTransaction().get(), "no manager means callbacks run directly");
        verify(h.tasks()).save(any(), anyString(), anyString(), anyString(), anyString(), anyList());
    }
}
