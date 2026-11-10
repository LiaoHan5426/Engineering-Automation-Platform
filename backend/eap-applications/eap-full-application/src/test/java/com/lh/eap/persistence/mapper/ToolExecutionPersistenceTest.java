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
                var historical = new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-status",
                        workspace.toRealPath().toString(), "git", "SUCCEEDED", false, Instant.now(), Instant.now(),
                        0, "historical status", "", false, "PROCESS_EXIT_CONFIRMED", null, List.of());
                store.insert(historical);
                var v28 = new ClassPathResource("db/migration/V28__git_diff_tool_executions.sql")
                        .getContentAsString(StandardCharsets.UTF_8).replace("eap.tool_execution", schema + ".tool_execution");
                try (var connection = original.getConnection()) {
                    ScriptUtils.executeSqlScript(connection, new ByteArrayResource(v28.getBytes(StandardCharsets.UTF_8)));
                }
                var v29 = new ClassPathResource("db/migration/V29__tool_unknown_manual_closure.sql")
                        .getContentAsString(StandardCharsets.UTF_8).replace("eap.tool_execution", schema + ".tool_execution");
                try (var connection = original.getConnection()) {
                    ScriptUtils.executeSqlScript(connection, new ByteArrayResource(v29.getBytes(StandardCharsets.UTF_8)));
                }
                assertEquals(historical, store.find(historical.id()).orElseThrow());
                var init = new ProcessBuilder("git", "init", "--quiet").directory(workspace.toFile()).redirectErrorStream(true).start();
                assertTrue(init.waitFor(5, TimeUnit.SECONDS)); assertEquals(0, init.exitValue());
                Files.writeString(workspace.resolve("tracked.txt"), "base\n");
                Files.writeString(workspace.resolve("staged-only.txt"), "staged only\n");
                var add = new ProcessBuilder("git", "add", "--", "tracked.txt", "staged-only.txt")
                        .directory(workspace.toFile()).redirectErrorStream(true).start();
                assertTrue(add.waitFor(5, TimeUnit.SECONDS)); assertEquals(0, add.exitValue());
                Files.writeString(workspace.resolve("tracked.txt"), "unstaged-change\n");
                Files.writeString(workspace.resolve("untracked.txt"), "untracked only\n");
                var index = Files.readAllBytes(workspace.resolve(".git/index"));
                var settings = mock(CapabilitySettings.class);
                when(settings.enabled("git-status")).thenReturn(true); when(settings.enabled("git-diff")).thenReturn(true);
                var handlers = mock(CapabilityHandlerRegistry.class);
                when(handlers.resolveFor(null, "git-status")).thenReturn(Optional.of(mock(GitInspectionHandler.class)));
                when(handlers.resolveFor(null, "git-diff")).thenReturn(Optional.of(mock(GitInspectionHandler.class)));
                var registry = new CapabilityRegistry().register(new GitCapability("status")).register(new GitCapability("diff"));
                try (var executor = new DefaultProcessExecutor()) {
                    var service = new ToolExecutionService(store, RuntimeWorkspace.colocated(workspace, ""), settings, handlers, registry, executor);
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
                        var diff = settle(service, service.start("git-diff", UUID.randomUUID()));
                        assertEquals("SUCCEEDED", diff.status(), diff.stderr());
                        assertTrue(diff.stdout().contains("+unstaged-change"));
                        assertFalse(diff.stdout().contains("staged-only.txt")); assertFalse(diff.stdout().contains("untracked.txt"));
                        assertEquals(List.of("root", "filters", "diff"), diff.steps().stream().map(ToolExecution.Step::phase).toList());
                        assertEquals(diff, new JdbcToolExecutionStore(new JdbcTemplate(isolated)).find(diff.id()).orElseThrow());
                        assertArrayEquals(index, Files.readAllBytes(workspace.resolve(".git/index")));
                        assertEquals("unstaged-change\n", Files.readString(workspace.resolve("tracked.txt")));
                        assertEquals(409, assertThrows(org.springframework.web.server.ResponseStatusException.class,
                                () -> service.start("git-status", diff.requestId())).getStatusCode().value());
                        Files.writeString(workspace.resolve("tracked.txt"), "large-diff-line\n".repeat(1000));
                        var large = settle(service, service.start("git-diff", UUID.randomUUID()));
                        assertEquals("SUCCEEDED", large.status()); assertTrue(large.truncated()); assertEquals(8000, large.stdout().length());
                        assertArrayEquals(index, Files.readAllBytes(workspace.resolve(".git/index")));
                        var open = new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-status", workspace.toRealPath().toString(),
                                "git", "RUNNING", false, Instant.now(), null, null, "", "", false, null, null,
                                List.of(new ToolExecution.Step(UUID.randomUUID(), "fixture", "RUNNING", List.of("git"),
                                        Map.of("processDescendants", List.of(Map.of("processPid", -1L,
                                                        "processStartedAt", "2026-11-09T08:00:00Z", "processExecutable", "/fixture/child")),
                                                "processDescendantsTruncated", true))));
                        store.insert(open);
                        assertThrows(DuplicateKeyException.class, () -> store.insert(new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-status",
                                open.workspacePath(), "git", "CREATED", false, Instant.now(), null, null, "", "", false, null, null, List.of())));
                        store.markRestartUnknown();
                        assertEquals("UNKNOWN", service.get(open.id()).status());
                        var beforeInspection = store.find(open.id()).orElseThrow();
                        var inspection = service.inspectProcesses("git-status", open.id());
                        assertEquals("UNKNOWN", inspection.executionStatus()); assertFalse(inspection.completeProcessTreeEvidence());
                        assertTrue(inspection.steps().getFirst().descendantsCaptured());
                        assertTrue(inspection.steps().getFirst().descendantsTruncated());
                        assertEquals("NOT_CAPTURED", inspection.steps().getFirst().descendants().getFirst().status());
                        assertEquals("/fixture/child", inspection.steps().getFirst().descendants().getFirst().capturedExecutable());
                        assertEquals(beforeInspection, new JdbcToolExecutionStore(new JdbcTemplate(isolated)).find(open.id()).orElseThrow());
                        assertEquals(beforeInspection, store.find(open.id()).orElseThrow(), "OS inspection does not persist or release UNKNOWN");
                        assertThrows(ToolExecutionService.Blocked.class, () -> service.start(UUID.randomUUID()));
                        var independent = settle(service, service.start("git-diff", UUID.randomUUID()));
                        assertEquals("SUCCEEDED", independent.status());
                        assertTrue(service.list("git-diff", 20).stream().allMatch(value -> value.capabilityId().equals("git-diff")));
                        assertEquals(404, assertThrows(org.springframework.web.server.ResponseStatusException.class,
                                () -> service.cancel("git-status", independent.id())).getStatusCode().value());
                        // The workspace-wide request constraint still rejects cross-operation reuse directly.
                        assertThrows(DuplicateKeyException.class, () -> store.insert(new ToolExecution(UUID.randomUUID(), open.requestId(),
                                "git", "git-diff", open.workspacePath(), "git", "SUCCEEDED", false, Instant.now(), Instant.now(),
                                0, "", "", false, "PROCESS_EXIT_CONFIRMED", null, List.of())));
                        var serialized = JsonMapper.builder().build().writeValueAsString(service.list(20));
                        assertTrue(serialized.contains("SERVICE_RESTART_EXIT_UNCONFIRMED"));
                        assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> store.update(open.id(),
                                value -> value.state("CLOSED_UNKNOWN", false, null, null, "", "", false, null, "test", List.of())));
                        assertEquals("UNKNOWN", store.find(open.id()).orElseThrow().status(), "Failed transition rolls back");
                        var reviewRequest = UUID.randomUUID();
                        var reviewed = service.resolveUnknown("git-status", open.id(), reviewRequest,
                                "Reviewed all related processes; test fixture never started a process", true);
                        assertEquals("CLOSED_UNKNOWN", reviewed.status());
                        assertEquals("SERVICE_RESTART_EXIT_UNCONFIRMED", reviewed.unconfirmedReason());
                        assertNull(reviewed.exitCode()); assertNull(reviewed.exitEvidence()); assertNull(reviewed.finishedAt());
                        assertEquals(reviewed, new JdbcToolExecutionStore(new JdbcTemplate(isolated)).find(open.id()).orElseThrow());
                        assertEquals(reviewed, service.resolveUnknown("git-status", open.id(), reviewRequest,
                                "Reviewed all related processes; test fixture never started a process", true));
                        assertEquals(reviewed, service.start(open.requestId()));
                        store.markRestartUnknown();
                        assertEquals(reviewed, store.find(open.id()).orElseThrow());
                        assertEquals("SUCCEEDED", settle(service, service.start(UUID.randomUUID())).status());
                        var race = new ToolExecution(UUID.randomUUID(), UUID.randomUUID(), "git", "git-diff",
                                open.workspacePath(), "git", "UNKNOWN", false, Instant.now(), null, null, "preserved", "", false, null, "test", List.of());
                        store.insert(race);
                        try (var workers = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
                            var gate = new java.util.concurrent.CountDownLatch(1);
                            var results = new ArrayList<java.util.concurrent.Future<String>>();
                            for (int i = 0; i < 2; i++) results.add(workers.submit(() -> {
                                gate.await();
                                try { return service.resolveUnknown("git-diff", race.id(), UUID.randomUUID(),
                                        "Fixture review: no real process was started", true).status(); }
                                catch (org.springframework.web.server.ResponseStatusException conflict) { return conflict.getReason(); }
                            }));
                            gate.countDown();
                            assertEquals(Set.of("CLOSED_UNKNOWN", "UNKNOWN_REVIEW_CONFLICT"),
                                    Set.of(results.get(0).get(5, TimeUnit.SECONDS), results.get(1).get(5, TimeUnit.SECONDS)));
                        }
                        assertEquals("preserved", store.find(race.id()).orElseThrow().stdout());

                    } finally { service.close(); }
                }
            }
        } finally {
            // This test never modifies the application schema or Flyway history.
            raw.execute("DROP SCHEMA " + schema + " CASCADE");
        }
    }
    private static ToolExecution settle(ToolExecutionService service, ToolExecution row) throws Exception {
        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (row.active() && System.nanoTime() < deadline) {
            Thread.sleep(20); row = service.get(row.capabilityId(), row.id());
        }
        assertFalse(row.active(), "Execution did not settle");
        return row;
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
