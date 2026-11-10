package com.lh.eap.ai;
import com.lh.eap.delivery.CodeProposalStore;
import com.lh.eap.delivery.JdbcCodeGenerationStore;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.JdbcCodeProposalStore;

import static org.junit.jupiter.api.Assertions.assertTrue;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Shared local-database lifecycle only; no inherited test cases. */
abstract class CodeProposalPersistenceFixture {
    @TempDir Path root;
    JdbcTemplate jdbc;
    DriverManagerDataSource dataSource;
    DataSourceTransactionManager manager;
    final String principal = "proposal-test-" + UUID.randomUUID();
    final UUID conversation = UUID.randomUUID();

    @BeforeEach void connect() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new org.springframework.boot.env.YamlPropertySourceLoader().load("application", new org.springframework.core.io.ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url", "");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"), "Existing local DB required");
        dataSource = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(dataSource); manager = new DataSourceTransactionManager(dataSource);
    }

    CodeProposalStore store() {
        return new JdbcCodeProposalStore(jdbc, manager);
    }

    CodeChangeService service(CodeProposalStore store) {
        return new CodeChangeService(new com.lh.eap.config.RuntimeWorkspace(root, root.toString()), null, null,
                new JdbcCodeGenerationStore(jdbc, manager), store);
    }

    @AfterEach void cleanup() {
        if (jdbc == null) return;
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass('eap.code_proposal') IS NOT NULL", Boolean.class)))
            jdbc.update("DELETE FROM eap.code_proposal WHERE principal=?", principal);
        jdbc.update("DELETE FROM eap.code_generation WHERE principal=?", principal);
    }
}
