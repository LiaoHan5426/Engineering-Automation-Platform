package com.lh.eap.application.retrieval;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.lh.eap.application.dto.KnowledgeDocumentRequest;
import com.lh.eap.application.service.KnowledgeManagementService;
import com.lh.eap.persistence.mapper.KnowledgeManagementMapper;
import com.lh.eap.persistence.mapper.KnowledgeRepository;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * KR-01 real Postgres contrast against the same predetermined fixture cases as the offline keyword probe.
 * Requires {@code EAP_RUN_BOARD_PERSISTENCE=true} and local application.yml datasource. Does not start KR-02.
 */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class RetrievalBaselineDbContrastTest {
    final UUID authorized = UUID.randomUUID();
    final UUID foreign = UUID.randomUUID();
    JdbcTemplate jdbc;
    TransactionTemplate tx;
    KnowledgeManagementService knowledge;

    @BeforeEach
    void seedOwnedFixtureCorpus() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) {
            env.getPropertySources().addLast(source);
        }
        String url = env.getProperty("spring.datasource.url");
        assertTrue(url != null && (url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:")));
        String password = env.getProperty("spring.datasource.password");
        assumeTrue(password != null && !password.isBlank(), "local datasource password required for KR-01 DB contrast");
        var dataSource = new DriverManagerDataSource(
                url, env.getProperty("spring.datasource.username"), password);
        jdbc = new JdbcTemplate(dataSource);
        var manager = new DataSourceTransactionManager(dataSource);
        tx = new TransactionTemplate(manager);
        tx.setTimeout(15);
        var mapper = new KnowledgeManagementMapper(jdbc);
        knowledge = new KnowledgeManagementService(new KnowledgeRepository(jdbc), mapper);
        mapper.insertBase(authorized, "kr01-authorized-" + authorized, "owned KR-01 fixture");
        mapper.insertBase(foreign, "kr01-foreign-" + foreign, "owned KR-01 fixture");
        tx.executeWithoutResult(status -> {
            try {
                for (var document : KeywordRetrievalProbe.fixtureCorpus(authorized, foreign).documents()) {
                    knowledge.addDocument(document.knowledgeBaseId(),
                            new KnowledgeDocumentRequest(document.source(), document.content()));
                }
            } catch (Exception failure) {
                throw new AssertionError(failure);
            }
        });
    }

    @AfterEach
    void removeOnlyOwnedBases() {
        if (jdbc != null) {
            jdbc.update("DELETE FROM eap.knowledge_base WHERE id IN (?,?)", authorized, foreign);
            assertEquals(0, jdbc.queryForObject(
                    "SELECT count(*) FROM eap.knowledge_base WHERE id IN (?,?)", Integer.class, authorized, foreign));
        }
    }

    @Test
    void postgresFtsMeetsSameDeclaredThresholdsAsKeywordProbe() {
        var offline = KeywordRetrievalProbe.fixtureCorpus(authorized, foreign);
        var offlineReport = RetrievalBaseline.evaluate(
                RetrievalBaseline.fixtureCases(authorized, foreign),
                testCase -> offline.search(testCase.query(), testCase.topK(), testCase.allowedBases()));
        assertTrue(offlineReport.meetsDeclaredThresholds());

        var postgres = new PostgresKnowledgeRetrieval(new KnowledgeRepository(jdbc));
        var dbReport = RetrievalBaseline.evaluate(
                RetrievalBaseline.fixtureCases(authorized, foreign),
                testCase -> postgres.search(testCase.query(), testCase.topK(), testCase.allowedBases()),
                PostgresKnowledgeRetrieval.METERING);
        assertEquals(PostgresKnowledgeRetrieval.METERING, dbReport.metering());
        assertEquals(0, dbReport.authzFailures());
        assertEquals(0, dbReport.emptyFailures());
        assertTrue(dbReport.meetsDeclaredThresholds(), () -> "DB contrast failed: " + dbReport.results());
        assertTrue(dbReport.results().stream().allMatch(RetrievalBaseline.CaseResult::passed),
                () -> "case failures: " + dbReport.results());
    }
}
