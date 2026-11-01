package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.*;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.persistence.mapper.*;
import com.lh.eap.rules.RulePackService;
import com.lh.eap.runtime.handler.*;
import com.lh.eap.application.dto.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;

/** Existing local Postgres only. No Spring Boot server, real model, migrations, schema reset or shared settings writes.
 * Fixture ownership is random expert/base IDs; cleanup deletes only these rows. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class ExpertKnowledgePersistenceTest {
    @TempDir Path root;
    JdbcTemplate jdbc;
    DataSourceTransactionManager manager;
    TransactionTemplate tx;
    KnowledgeManagementService knowledge;
    ExpertDefinitionService experts;
    ExpertDefinitionMapper definitions;
    ExpertKnowledgeContextService resolver;
    final UUID baseA = UUID.randomUUID(), baseB = UUID.randomUUID();
    final String expertA = "chat-fixture-" + UUID.randomUUID(), expertB = "chat-fixture-" + UUID.randomUUID();
    KnowledgeExpertRef refA, refB;
    UUID documentA;

    @BeforeEach void connectAndCreateOwnedFixtures() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"));
        var dataSource = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(dataSource);
        manager = new DataSourceTransactionManager(dataSource);
        tx = new TransactionTemplate(manager); tx.setTimeout(10);
        var settings = new CapabilitySettings(jdbc, new CapabilityUsage(jdbc));
        experts = new ExpertDefinitionService(jdbc, new RulePackService(jdbc), new McpServerRegistry(jdbc), settings);
        definitions = new ExpertDefinitionMapper(jdbc);
        var repository = new KnowledgeRepository(jdbc);
        var registry = new CapabilityHandlerRegistry(List.of(new KnowledgeSearchHandler(repository)), settings);
        resolver = proxied(new ExpertKnowledgeContextService(definitions, experts, registry));
        var mapper = new KnowledgeManagementMapper(jdbc);
        knowledge = new KnowledgeManagementService(repository, mapper);
        mapper.insertBase(baseA, "fixture-a", "owned test"); mapper.insertBase(baseB, "fixture-b", "owned test");
        documentA = addDocument(baseA, "needle alpha-private");
        addDocument(baseB, "needle beta-private");
        refA = createExpert(expertA, baseA); refB = createExpert(expertB, baseB);
    }
    ExpertKnowledgeContextService proxied(ExpertKnowledgeContextService target) {
        var proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (ExpertKnowledgeContextService) proxy.getProxy();
    }
    UUID addDocument(UUID base, String text) {
        return tx.execute(s -> {
            try { return (UUID) knowledge.addDocument(base, new KnowledgeDocumentRequest("fixture.md", text)).get("id"); }
            catch (java.security.NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
        });
    }
    KnowledgeExpertRef createExpert(String id, UUID base) {
        var manifest = new ExpertManifest("eap/v1", "Expert", id, "fixture", List.of(base.toString()), List.of(),
                List.of(new ExpertManifest.Step("read", "Knowledge", "knowledge.search", true)), List.of(),
                List.of("database.credentials.never-expose"));
        tx.executeWithoutResult(s -> definitions.saveDraft(id, "fixture", ExpertManifest.serialize(manifest)));
        tx.executeWithoutResult(s -> experts.activate(id, true));
        return tx.execute(s -> new KnowledgeExpertRef(id, ((Number) definitions.lockForKnowledge(id).orElseThrow().get("revision")).longValue()));
    }
    @AfterEach void removeOnlyOwnedRows() {
        if (jdbc != null) {
            jdbc.update("DELETE FROM eap.expert_definition WHERE id IN (?,?)", expertA, expertB);
            jdbc.update("DELETE FROM eap.knowledge_base WHERE id IN (?,?)", baseA, baseB);
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.expert_definition WHERE id IN (?,?)", Integer.class, expertA, expertB));
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.knowledge_base WHERE id IN (?,?)", Integer.class, baseA, baseB));
        }
    }
    String send(KnowledgeExpertRef ref) {
        return "{\"message\":\"needle\",\"toolMode\":\"none\",\"context\":{\"knowledgeExpertRef\":{\"id\":\"" + ref.id() + "\",\"revision\":" + ref.revision() + "}}}";
    }
    @Test void realRetrievalIsIsolatedAndSendRefreshesUpdatedDeletedAndRevokedKnowledge() {
        var a = resolver.resolve(refA, "needle"); var b = resolver.resolve(refB, "needle");
        assertEquals("alpha-private", a.references().getFirst().excerpt().split(" ")[1]);
        assertFalse(a.toString().contains("beta-private")); assertTrue(b.toString().contains("beta-private"));
        assertFalse(b.toString().contains("alpha-private"));
        var h = new AiChatApplicationTest(); h.root = root;
        var prompts = new ArrayList<String>();
        var app = h.app(p -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "No model inside database lock/transaction");
            prompts.add(p.toString()); return FakeChatModels.text("derived-private-answer");
        }, true, null, null);
        ReflectionTestUtils.setField(app, "expertKnowledge", resolver);
        var id = app.open("{}").conversationId();
        assertTrue(app.send(id, send(refA)).knowledgeMemoryCleared());
        assertTrue(prompts.getLast().contains("alpha-private"));
        app.send(id, send(refB));
        assertFalse(prompts.getLast().contains("alpha-private")); assertTrue(prompts.getLast().contains("beta-private"));
        jdbc.update("UPDATE eap.knowledge_chunk SET content=? WHERE document_id=?", "needle updated-private", documentA);
        assertTrue(app.send(id, send(refA)).knowledgeContext().toString().contains("updated-private"));
        assertFalse(prompts.getLast().contains("alpha-private")); assertFalse(prompts.getLast().contains("beta-private"));
        tx.executeWithoutResult(s -> knowledge.removeDocument(baseA, documentA));
        assertEquals("no_matches", app.send(id, send(refA)).knowledgeContext().status());
        assertFalse(prompts.getLast().contains("updated-private")); assertFalse(prompts.getLast().contains("derived-private-answer"));
        assertEquals("ready", resolver.resolve(refB, "needle").status());
        tx.executeWithoutResult(s -> experts.activate(expertB, false));
        int calls = prompts.size();
        assertEquals("EXPERT_CONTEXT_STALE", assertThrows(ResponseStatusException.class, () -> app.send(id, send(refB))).getReason());
        assertEquals(calls, prompts.size());
        app.send(id, ExpertKnowledgeChatTest.PLAIN);
        assertFalse(prompts.getLast().contains("private"));
    }
    @Test void definitionUpdateCommittedBeforeReadRejectsTheOldRevisionWithoutAModel() throws Exception {
        var locked = new CountDownLatch(1); var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var update = pool.submit(() -> tx.executeWithoutResult(s -> {
                jdbc.queryForList("SELECT id FROM eap.expert_definition WHERE id=? FOR UPDATE", expertA);
                locked.countDown();
                try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException error) { throw new AssertionError(error); }
                experts.activate(expertA, false);
            }));
            assertTrue(locked.await(5, TimeUnit.SECONDS));
            var read = pool.submit(() -> assertThrows(ResponseStatusException.class, () -> resolver.resolve(refA, "needle")));
            try { assertThrows(TimeoutException.class, () -> read.get(150, TimeUnit.MILLISECONDS)); }
            finally { release.countDown(); }
            update.get(10, TimeUnit.SECONDS);
            assertEquals("EXPERT_CONTEXT_STALE", read.get(10, TimeUnit.SECONDS).getReason());
        }
    }
}
