package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.*;
import com.lh.eap.application.service.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.*;
import com.lh.eap.runtime.handler.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.Connection;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.context.annotation.*;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.*;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import tools.jackson.databind.json.JsonMapper;

/** Existing opt-in local test datasource; only a UUID-owned schema is created/dropped. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class ToolExecutionPersistenceTest {
    @Configuration @EnableTransactionManagement static class Transactions {
        @Bean PlatformTransactionManager transactionManager(DataSource dataSource) { return new DataSourceTransactionManager(dataSource); }
        @Bean JdbcToolExecutionStore store(DataSource dataSource) { return new JdbcToolExecutionStore(new JdbcTemplate(dataSource)); }
    }
    @Test void realGitSnapshotsSurviveReconstructionAndRestartUnknownBlocksDuplicates(@TempDir Path workspace) throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        var url = env.getProperty("spring.datasource.url");
        assertTrue(url != null && (url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:")));
        var password = env.getProperty("spring.datasource.password");
        assumeTrue(password != null && !password.isBlank(), "Local test datasource password required");
        var original = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), password);
        var raw = new JdbcTemplate(original);
        var schema = "eap_tool_qa_" + UUID.randomUUID().toString().replace("-", "");
        assertTrue(schema.matches("eap_tool_qa_[a-f0-9]{32}"));
        raw.execute("CREATE SCHEMA " + schema);
        try {
            // Relocate only this migration and the repository SQL to the owned schema.
            var sql = (new ClassPathResource("db/migration/V26__tool_operation_executions.sql").getContentAsString(StandardCharsets.UTF_8)
                    + "\n" + new ClassPathResource("db/migration/V27__tool_operation_column_comments.sql").getContentAsString(StandardCharsets.UTF_8))
                    .replace("eap.tool_execution", schema + ".tool_execution");
            try (var connection = original.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)));
            }
            DataSource isolated = new AbstractDataSource() {
                public Connection getConnection() throws java.sql.SQLException { return relocate(original.getConnection(), schema); }
                public Connection getConnection(String user, String pass) throws java.sql.SQLException { return relocate(original.getConnection(user, pass), schema); }
            };
            try (var context = new AnnotationConfigApplicationContext()) {
                context.registerBean(DataSource.class, () -> isolated); context.register(Transactions.class); context.refresh();
                var store = context.getBean(ToolExecutionStore.class);
                var init = new ProcessBuilder("git", "init", "--quiet").directory(workspace.toFile()).redirectErrorStream(true).start();
                assertTrue(init.waitFor(5, TimeUnit.SECONDS)); assertEquals(0, init.exitValue());
                var settings = mock(CapabilitySettings.class); when(settings.enabled("git-status")).thenReturn(true);
                var handlers = mock(CapabilityHandlerRegistry.class);
                when(handlers.resolveFor(null, "git-status")).thenReturn(Optional.of(mock(GitInspectionHandler.class)));
                var registry = new CapabilityRegistry().register(new GitCapability("status"));
                try (var executor = new DefaultProcessExecutor()) {
                    var service = new ToolExecutionService(store, RuntimeWorkspace.colocated(workspace, "", ""), settings, handlers, registry, executor);
                    try {
                        service.afterPropertiesSet();
                        var row = service.start(UUID.randomUUID());
                        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
                        while (row.active() && System.nanoTime() < deadline) { Thread.sleep(20); row = service.get(row.id()); }
                        assertEquals("SUCCEEDED", row.status(), row.stderr());
                        assertEquals(3, row.steps().size()); assertNotNull(row.exitEvidence());
                        assertEquals(row.id(), service.start(row.requestId()).id());
                        assertEquals("SUCCEEDED", service.cancel(row.id()).status());
                        var reconstructed = new JdbcToolExecutionStore(new JdbcTemplate(isolated)).find(row.id()).orElseThrow();
                        assertEquals(row, reconstructed);
                        var open = new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-status", workspace.toRealPath().toString(),
                                "git", "RUNNING", false, Instant.now(), null, null, "", "", false, null, null, List.of());
                        store.insert(open);
                        assertThrows(DuplicateKeyException.class, () -> store.insert(new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-status",
                                open.workspacePath(), "git", "CREATED", false, Instant.now(), null, null, "", "", false, null, null, List.of())));
                        store.markRestartUnknown();
                        assertEquals("UNKNOWN", service.get(open.id()).status());
                        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
                        var serialized = JsonMapper.builder().build().writeValueAsString(service.list(20));
                        assertTrue(serialized.contains("SERVICE_RESTART_EXIT_UNCONFIRMED"));
                    } finally { service.close(); }
                }
            }
        } finally {
            // This test never modifies the application schema or Flyway history.
            raw.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }
    private static Connection relocate(Connection connection, String schema) {
        return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, method, args) -> {
            if (args != null && args.length > 0 && args[0] instanceof String sql && method.getName().equals("prepareStatement")) {
                args = args.clone(); args[0] = sql.replace("eap.tool_execution", schema + ".tool_execution");
            }
            try {
                var result = method.invoke(connection, args);
                if (method.getName().equals("createStatement")) {
                    var statement = (java.sql.Statement) result;
                    return Proxy.newProxyInstance(java.sql.Statement.class.getClassLoader(), new Class<?>[]{java.sql.Statement.class}, (p, m, a) -> {
                        if (a != null && a.length > 0 && a[0] instanceof String sql) {
                            a = a.clone(); a[0] = sql.replace("eap.tool_execution", schema + ".tool_execution");
                        }
                        try { return m.invoke(statement, a); }
                        catch (InvocationTargetException error) { throw error.getCause(); }
                    });
                }
                return result;
            }
            catch (InvocationTargetException error) { throw error.getCause(); }
        });
    }
}
