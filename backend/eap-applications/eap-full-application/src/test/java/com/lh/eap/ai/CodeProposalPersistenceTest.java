package com.lh.eap.ai;
import com.lh.eap.delivery.CodeProposalStore;
import com.lh.eap.delivery.JdbcCodeGenerationStore;
import com.lh.eap.delivery.CodeChangeService;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.transaction.support.TransactionTemplate;

/** Existing LOCAL migrated database only. No service lifecycle, migration or schema reset. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class CodeProposalPersistenceTest extends CodeProposalPersistenceFixture {
    CodeChangeService.Proposal propose(CodeChangeService service, boolean writable) {
        var generation = service.prepareGeneration(principal, conversation, "Page.vue", "", "");
        return service.proposePrepared(principal, conversation, generation.id(),
                "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", writable);
    }
    @Test void proposalIsCommittedBeforeReturnAndSurvivesOuterRollbackAndAdapterRecreation() throws Exception {
        assertTrue(Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass('eap.code_proposal') IS NOT NULL", Boolean.class)), "Current initialization baseline must be applied by the authorized running service");
        var store = store();
        Files.writeString(root.resolve("Page.vue"), "original");
        var proposal = new TransactionTemplate(manager).execute(tx -> {
            var saved = propose(service(store), true);
            try (var connection = dataSource.getConnection(); var query = connection.prepareStatement("SELECT status FROM eap.code_proposal WHERE id=?")) {
                query.setObject(1, saved.id());
                try (var rows = query.executeQuery()) { assertTrue(rows.next()); assertEquals("PROPOSED", rows.getString(1)); }
            } catch (java.sql.SQLException failure) { throw new IllegalStateException(failure); }
            tx.setRollbackOnly(); return saved;
        });
        assertEquals(proposal, store().find(principal, conversation, proposal.id()).orElseThrow().proposal());
        assertTrue(store.find("other", conversation, proposal.id()).isEmpty());
        assertTrue(store.find(principal, UUID.randomUUID(), proposal.id()).isEmpty());
        assertThrows(org.springframework.dao.DuplicateKeyException.class, () -> store.save(principal, proposal));
        assertEquals("original", Files.readString(root.resolve("Page.vue")));
    }
    @Test void intentCommitsOutsideCallerTransactionAndOnlyOneConcurrentClaimWins() throws Exception {
        var store = store(); var saved = propose(service(store), true);
        var barrier = new java.util.concurrent.CyclicBarrier(2);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> claim = () -> { barrier.await(); return store().claim(principal, conversation, saved.id()); };
            var first = pool.submit(claim); var second = pool.submit(claim);
            assertEquals(1, java.util.stream.Stream.of(first.get(10, java.util.concurrent.TimeUnit.SECONDS),
                    second.get(10, java.util.concurrent.TimeUnit.SECONDS)).filter(Boolean.TRUE::equals).count());
        }
        assertEquals("APPLYING", store().find(principal, conversation, saved.id()).orElseThrow().status());
        assertFalse(Files.exists(root.resolve("Page.vue")));
        var another = propose(service(store), true);
        assertEquals("CODE_WORKSPACE_BUSY", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> store.claim(principal, conversation, another.id())).getReason());
        service(store()).recoverInterruptedApplications();
        assertEquals("UNKNOWN", store().find(principal, conversation, saved.id()).orElseThrow().status());
        assertEquals("CODE_WORKSPACE_BUSY", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> store.claim(principal, conversation, another.id())).getReason());
        assertEquals("PROPOSED", store.find(principal, conversation, another.id()).orElseThrow().status());
    }
    @Test void applyPersistsReadbackAndReplayDoesNotTouchSourceOrRevalidatePermissions() throws Exception {
        var store = store(); Files.writeString(root.resolve("Page.vue"), "original");
        var saved = propose(service(store), true);
        var result = new TransactionTemplate(manager).execute(tx -> {
            var applied = service(store).apply(principal, conversation, saved.id(), true);
            tx.setRollbackOnly(); return applied;
        });
        assertEquals("APPLIED", result.status()); assertNotNull(result.afterHash());
        assertEquals("candidate", Files.readString(root.resolve("Page.vue")));
        assertEquals(result, store().find(principal, conversation, saved.id()).orElseThrow().result());
        Files.writeString(root.resolve("Page.vue"), "later edit");
        var ungranted = new CodeChangeService(new com.lh.eap.config.RuntimeWorkspace(root, ""), null, null,
                new JdbcCodeGenerationStore(jdbc, manager), store());
        assertEquals(result, ungranted.apply(principal, conversation, saved.id(), true));
        assertEquals("later edit", Files.readString(root.resolve("Page.vue")));
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbc.update("UPDATE eap.code_proposal SET proposal=jsonb_set(proposal,'{summary}','\"tampered\"'::jsonb) WHERE id=?", saved.id()));
    }
    @Test void failedDatabaseResultWriteLeavesCommittedApplyingAndRecoveryBlocksRetry() throws Exception {
        var delegate = store();
        var failing = org.mockito.Mockito.mock(CodeProposalStore.class, org.mockito.AdditionalAnswers.delegatesTo(delegate));
        org.mockito.Mockito.doThrow(new IllegalStateException("injected result DB failure")).when(failing)
                .finish(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any(),
                        org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString());
        var saved = propose(service(failing), true);
        assertEquals("CODE_APPLICATION_UNKNOWN", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> service(failing).apply(principal, conversation, saved.id(), true)).getReason());
        assertEquals("candidate", Files.readString(root.resolve("Page.vue")));
        assertEquals("APPLYING", store().find(principal, conversation, saved.id()).orElseThrow().status());
        service(store()).recoverInterruptedApplications();
        assertEquals("UNKNOWN", store().find(principal, conversation, saved.id()).orElseThrow().status());
        assertEquals("CODE_APPLICATION_UNKNOWN", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> service(store()).apply(principal, conversation, saved.id(), true)).getReason());
    }
    @Test void intentIsVisibleFromIndependentConnectionBeforeAnyFileWriteWithoutAnAmbientTransaction() throws Exception {
        var delegate = store();
        var observing = org.mockito.Mockito.mock(CodeProposalStore.class, org.mockito.AdditionalAnswers.delegatesTo(delegate));
        var saved = propose(service(observing), true);
        org.mockito.Mockito.doAnswer(call -> {
            boolean claimed = delegate.claim(principal, conversation, saved.id());
            assertFalse(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive());
            try (var connection = dataSource.getConnection(); var query = connection.prepareStatement("SELECT status FROM eap.code_proposal WHERE id=?")) {
                query.setObject(1, saved.id());
                try (var rows = query.executeQuery()) { assertTrue(rows.next()); assertEquals("APPLYING", rows.getString(1)); }
            }
            assertFalse(Files.exists(root.resolve("Page.vue"))); return claimed;
        }).when(observing).claim(principal, conversation, saved.id());
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            assertEquals("APPLIED", service(observing).apply(principal, conversation, saved.id(), true).status());
            tx.setRollbackOnly();
        });
        assertEquals("APPLIED", store().find(principal, conversation, saved.id()).orElseThrow().status());
    }
}
