package com.lh.eap.ai;
import com.lh.eap.delivery.JdbcCodeGenerationStore;
import com.lh.eap.delivery.CodeChangeService;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Existing migrated LOCAL DB only. Uses the same in-process configuration as BoardRunPersistenceTest.
 * Credentials never enter command-line arguments or test output. No migration, reset or server lifecycle.
 * Cleans only this test's randomly identified generation row. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class CodeGenerationPersistenceTest {
    @TempDir Path root;
    private JdbcTemplate jdbc;
    private UUID ownedId;

    @Test void committedBeforeModelBoundaryAndReopenedAfterOuterRollback() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new org.springframework.boot.env.YamlPropertySourceLoader().load("application", new org.springframework.core.io.ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url", "");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"),
                "Provide existing local PostgreSQL via SPRING_DATASOURCE_URL (current initialization baseline must already be applied)");
        var dataSource = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(dataSource);
        var manager = new DataSourceTransactionManager(dataSource);
        var store = new JdbcCodeGenerationStore(jdbc, manager);
        var service = new CodeChangeService(new com.lh.eap.config.RuntimeWorkspace(root, root.toString()), null, null, store);
        Files.writeString(root.resolve("Page.vue"), "<template>persistent baseline</template>");
        var conversation = UUID.randomUUID();
        var transaction = new TransactionTemplate(manager);
        var saved = transaction.execute(status -> {
            var snapshot = service.prepareGeneration("generation-test", conversation, "Page.vue", "", "");
            ownedId = snapshot.id();
            // Independent JDBC connection sees the committed snapshot before any model may be called.
            try (var connection = dataSource.getConnection(); var query = connection.prepareStatement("SELECT source_content FROM eap.code_generation WHERE id=?")) {
                query.setObject(1, snapshot.id());
                try (var rows = query.executeQuery()) { assertTrue(rows.next()); assertEquals(snapshot.source(), rows.getString(1)); }
            } catch (java.sql.SQLException failure) { throw new IllegalStateException(failure); }
            status.setRollbackOnly();
            return snapshot;
        });
        var reopened = new JdbcCodeGenerationStore(new JdbcTemplate(dataSource), manager).find(saved.id()).orElseThrow();
        assertEquals(saved, reopened);
        assertThrows(org.springframework.dao.DuplicateKeyException.class, () -> store.save(saved));
        assertEquals(saved, store.find(saved.id()).orElseThrow());
    }
    @AfterEach void removeOnlyOwnedRow() {
        if (jdbc != null && ownedId != null) jdbc.update("DELETE FROM eap.code_generation WHERE id=? AND principal='generation-test'", ownedId);
    }
}
