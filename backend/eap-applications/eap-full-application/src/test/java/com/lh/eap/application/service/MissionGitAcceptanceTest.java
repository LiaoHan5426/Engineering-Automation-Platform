package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lh.eap.api.Observation;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.DefaultProcessExecutor;
import com.lh.eap.persistence.mapper.JdbcMissionExecutionStore;
import com.lh.eap.persistence.mapper.JdbcMissionStore;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import javax.sql.DataSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.server.ResponseStatusException;

@EnabledIfEnvironmentVariable(named = "EAP_RUN_MISSION_GIT_ACCEPTANCE", matches = "true")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class MissionGitAcceptanceTest {
    private final UUID sentinelMission = UUID.randomUUID();
    private final UUID sentinelHandoff = UUID.randomUUID();
    private boolean sentinelCreated;

    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private MissionStore missions;
    private MissionExecutionStore executions;

    private Path repo;
    private UUID handoffId;
    private UUID missionId;
    private String existingExecution;
    private int taskCount;

    @BeforeAll
    void isolatedRepository() throws Exception {
        context = new AnnotationConfigApplicationContext(IsolatedDb.class);
        jdbc = context.getBean(JdbcTemplate.class);
        missions = context.getBean(MissionStore.class);
        executions = context.getBean(MissionExecutionStore.class);
        // Own the unrelated sentinel as well; a fresh migrated DB must be sufficient.
        new org.springframework.transaction.support.TransactionTemplate(context.getBean(PlatformTransactionManager.class)).executeWithoutResult(status -> {
            jdbc.update("INSERT INTO eap.handoff(id,source,source_ref,summary,status,execution,approval,grant_state,created_at) VALUES (?, 'builder', 'acceptance-sentinel', 'untouched sentinel', 'recorded', 'not_started', 'not_requested', 'none', now())", sentinelHandoff);
            jdbc.update("INSERT INTO eap.mission(id,handoff_id,status,execution,approval,verification,grant_state,created_at) VALUES (?, ?, 'created', 'not_started', 'not_requested', 'not_requested', 'none', now())", sentinelMission, sentinelHandoff);
        });
        sentinelCreated = true;
        existingExecution = jdbc.queryForObject("SELECT execution FROM eap.mission WHERE id = ?", String.class, sentinelMission);
        taskCount = jdbc.queryForObject("SELECT count(*) FROM eap.task", Integer.class);
        repo = Files.createTempDirectory("eap-git-acceptance");
        var init = new ProcessBuilder("git", "init").directory(repo.toFile()).start();
        assertEquals(0, init.waitFor());
        handoffId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO eap.handoff(id, source, source_ref, summary, status, execution, approval, grant_state, created_at)
                VALUES (?, 'builder', 'acceptance-git', 'isolated git acceptance', 'recorded', 'not_started', 'not_requested', 'none', now())
                """, handoffId);
        missionId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO eap.mission(id, handoff_id, status, execution, approval, verification, grant_state, created_at)
                VALUES (?, ?, 'created', 'not_started', 'not_requested', 'not_requested', 'none', now())
                """, missionId, handoffId);
    }

    @AfterAll
    void removeOnlyAcceptanceRows() throws Exception {
        if (missionId != null) {
            jdbc.update("DELETE FROM eap.mission_execution WHERE mission_id = ?", missionId);
            jdbc.update("DELETE FROM eap.mission WHERE id = ?", missionId);
        }
        if (handoffId != null) jdbc.update("DELETE FROM eap.handoff WHERE id = ?", handoffId);
        if (repo != null) {
            try (var walk = Files.walk(repo)) {
                walk.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                    try { Files.deleteIfExists(path); } catch (Exception ignored) { }
                });
            }
        }
        try {
            if (sentinelCreated) {
                assertEquals(existingExecution, jdbc.queryForObject("SELECT execution FROM eap.mission WHERE id = ?", String.class, sentinelMission));
                assertEquals("untouched sentinel", jdbc.queryForObject("SELECT summary FROM eap.handoff WHERE id = ?", String.class, sentinelHandoff));
                assertEquals(taskCount, jdbc.queryForObject("SELECT count(*) FROM eap.task", Integer.class));
            }
        } finally {
            if (sentinelCreated) {
                jdbc.update("DELETE FROM eap.mission_execution WHERE mission_id = ?", sentinelMission);
                jdbc.update("DELETE FROM eap.mission WHERE id = ?", sentinelMission);
                jdbc.update("DELETE FROM eap.handoff WHERE id = ?", sentinelHandoff);
            }
            if (context != null) context.close();
        }
    }

    @Test
    @Order(1)
    void denialsDoNotInsertAndARealGitStatusMatchesTheProjection() throws Exception {
        assertDenied(service(bound(repo), new CapabilitySettings(jdbc, null) {
            @Override public boolean enabled(String capability) { return !"git-status".equals(capability); }
        }, CliChannels.defaults(), new DefaultProcessExecutor()), "CAPABILITY_DISABLED");
        assertDenied(service(bound(Files.createTempDirectory("eap-root-outside")), new CapabilitySettings(jdbc, null),
                CliChannels.defaults(), new DefaultProcessExecutor()), "WORKSPACE_ESCAPES_ROOT");
        assertDenied(service(bound(repo), new CapabilitySettings(jdbc, null), new CliChannels(null, null) {
            @Override public String binaryFor(String capability, String shippedDefault) { return "Z:/missing/not-git.exe"; }
        }, new DefaultProcessExecutor()), "BINARY_MISSING");
        assertEquals(0, executionCount());

        var gate = new GateExecutor();
        var service = service(bound(repo), new CapabilitySettings(jdbc, null), CliChannels.defaults(), gate);
        var first = new AtomicReference<MissionExecution>();
        var worker = new Thread(() -> first.set(service.start(missionId)));
        worker.start();
        assertTrue(gate.entered.await(20, TimeUnit.SECONDS));
        var same = service.start(missionId);
        gate.release.countDown();
        worker.join(30_000);
        assertEquals(first.get().id(), same.id());
        assertEquals("SUCCEEDED", first.get().status());
        assertEquals(0, first.get().exitCode());
        assertEquals("local-operator", first.get().principal());
        assertEquals("git-status", first.get().capability());
        assertEquals("NOT_REQUIRED", first.get().approval());
        assertTrue(first.get().stdout().contains("On branch") || first.get().stdout().contains("No commits"));
        assertFalse(first.get().stdout().contains("已完成"));
        assertFalse(first.get().stdout().contains("验证通过"));
        assertMission("succeeded");

        var again = service(bound(repo), new CapabilitySettings(jdbc, null), CliChannels.defaults(), new DefaultProcessExecutor()).start(missionId);
        assertNotEquals(first.get().id(), again.id());
        assertEquals("SUCCEEDED", again.status());
        assertEquals(2, executionCount());
        assertMission("succeeded");
        var statuses = jdbc.queryForList("SELECT status FROM eap.mission_execution WHERE mission_id = ? ORDER BY created_at", String.class, missionId);
        assertEquals(List.of("SUCCEEDED", "SUCCEEDED"), statuses);
    }

    @Test
    @Order(2)
    void restartUnknownLeavesTheProcessAndBlocksAnotherStart() throws Exception {
        var sleeper = startSleeper();
        try {
            var before = executionCount();
            service(bound(repo), new CapabilitySettings(jdbc, null), CliChannels.defaults(), sleeper.executor, onlyThisMission()).markRestartUnknown();
            var row = executions.find(sleeper.executionId).orElseThrow();
            assertEquals("CREATED", row.status());
            assertEquals(MissionGitExecutionService.RESTART_UNKNOWN, row.unconfirmedReason());
            assertTrue(ProcessHandle.of(sleeper.pid).orElseThrow().isAlive());
            var again = service(bound(repo), new CapabilitySettings(jdbc, null), CliChannels.defaults(), new DefaultProcessExecutor()).start(missionId);
            assertEquals(sleeper.executionId, again.id());
            assertEquals(before, executionCount());
            assertTrue(ProcessHandle.of(sleeper.pid).orElseThrow().isAlive());
        } finally {
            sleeper.stop();
            jdbc.update("DELETE FROM eap.mission_execution WHERE id = ?", sleeper.executionId);
            jdbc.update("UPDATE eap.mission SET execution = 'succeeded' WHERE id = ?", missionId);
        }
    }

    @Test
    @Order(4)
    void identityWriteFailureDoesNotLeaveTheGitProcessRunning() {
        var seen = new java.util.concurrent.atomic.AtomicLong();
        var failing = new MissionExecutionStore() {
            @Override public void insertOpen(MissionExecution execution) { executions.insertOpen(execution); }
            @Override public boolean claimCreated(UUID id) { return executions.claimCreated(id); }
            @Override public Optional<MissionExecution> open(UUID id) { return executions.open(id); }
            @Override public Optional<MissionExecution> find(UUID id) { return executions.find(id); }
            @Override public List<MissionExecution> list(UUID id) { return executions.list(id); }
            @Override public List<MissionExecution> openAll() { return executions.openAll(); }
            @Override public void markCancelling(UUID id) { executions.markCancelling(id); }
            @Override public void rememberProcess(UUID id, long pid, Instant startedAt, String user, String executable) {
                seen.set(pid);
                throw new IllegalStateException("identity write failed");
            }
            @Override public void finish(UUID id, UUID mission, String status, String projection, String evidence, Integer exitCode, String stdout, String stderr, boolean cancelRequested) {
                executions.finish(id, mission, status, projection, evidence, exitCode, stdout, stderr, cancelRequested);
            }
            @Override public void unconfirmed(UUID id, String reason) { executions.unconfirmed(id, reason); }
            @Override public void failSameRow(UUID id, UUID mission, String reason) { executions.failSameRow(id, mission, reason); }
        };
        var registry = new CapabilityRegistry().register(new GitCapability("status"));
        var handlers = new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry, new DefaultProcessExecutor())));
        var service = new MissionGitExecutionService(missions, failing, handlers, new CapabilitySettings(jdbc, null), registry,
                new DefaultProcessExecutor(), bound(repo));
        var failed = service.start(missionId);
        assertEquals("FAILED", failed.status());
        assertEquals("failed", jdbc.queryForObject("SELECT execution FROM eap.mission WHERE id = ?", String.class, missionId));
        assertTrue(seen.get() > 0);
        assertFalse(ProcessHandle.of(seen.get()).map(ProcessHandle::isAlive).orElse(false));
        jdbc.update("DELETE FROM eap.mission_execution WHERE mission_id = ?", missionId);
        jdbc.update("UPDATE eap.mission SET execution = 'not_started' WHERE id = ?", missionId);
    }

    private void assertDenied(MissionGitExecutionService service, String reason) {
        var denied = org.junit.jupiter.api.Assertions.assertThrows(ResponseStatusException.class, () -> service.start(missionId));
        assertEquals(reason, denied.getReason());
        assertEquals(0, executionCount());
    }

    private void assertMission(String projection) {
        var row = jdbc.queryForMap("SELECT status, execution, approval, verification, grant_state FROM eap.mission WHERE id = ?", missionId);
        assertEquals("created", row.get("status"));
        assertEquals(projection, row.get("execution"));
        assertEquals("not_requested", row.get("approval"));
        assertEquals("not_requested", row.get("verification"));
        assertEquals("none", row.get("grant_state"));
    }

    private void assertMissionProjectionFor(UUID id, String projection) {
        assertEquals(projection, jdbc.queryForObject("SELECT execution FROM eap.mission WHERE id = ?", String.class, id));
    }

    private int executionCount() {
        return jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution WHERE mission_id = ?", Integer.class, missionId);
    }

    private RuntimeWorkspace bound(Path root) {
        return new RuntimeWorkspace(repo, root.toString(), "");
    }

    private MissionGitExecutionService service(RuntimeWorkspace runtime, CapabilitySettings settings, CliChannels channels, ProcessExecutor executor) {
        return service(runtime, settings, channels, executor, executions);
    }

    private MissionGitExecutionService service(RuntimeWorkspace runtime, CapabilitySettings settings, CliChannels channels,
                                               ProcessExecutor executor, MissionExecutionStore store) {
        var registry = new CapabilityRegistry().register(new GitCapability("status", () -> channels.binaryFor("git-status", "git")));
        var handlers = new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry, executor)));
        return new MissionGitExecutionService(missions, store, handlers, settings, registry, executor, runtime);
    }

    private MissionExecutionStore onlyThisMission() {
        return new MissionExecutionStore() {
            @Override public void insertOpen(MissionExecution execution) { executions.insertOpen(execution); }
            @Override public boolean claimCreated(UUID id) { return executions.claimCreated(id); }
            @Override public Optional<MissionExecution> open(UUID id) { return executions.open(id); }
            @Override public Optional<MissionExecution> find(UUID id) { return executions.find(id); }
            @Override public List<MissionExecution> list(UUID id) { return executions.list(id); }
            @Override public List<MissionExecution> openAll() {
                return executions.openAll().stream().filter(row -> missionId.equals(row.missionId())).toList();
            }
            @Override public void markCancelling(UUID id) { executions.markCancelling(id); }
            @Override public void rememberProcess(UUID id, long pid, Instant startedAt, String user, String executable) {
                executions.rememberProcess(id, pid, startedAt, user, executable);
            }
            @Override public void finish(UUID id, UUID mission, String status, String projection, String evidence, Integer exitCode, String stdout, String stderr, boolean cancelRequested) {
                executions.finish(id, mission, status, projection, evidence, exitCode, stdout, stderr, cancelRequested);
            }
            @Override public void unconfirmed(UUID id, String reason) { executions.unconfirmed(id, reason); }
            @Override public void failSameRow(UUID id, UUID mission, String reason) { executions.failSameRow(id, mission, reason); }
        };
    }

    private Sleeper startSleeper() throws Exception {
        var executor = new DefaultProcessExecutor(java.time.Duration.ofSeconds(20));
        var executionId = UUID.randomUUID();
        var now = Instant.now();
        executions.insertOpen(new MissionExecution(executionId, missionId, "CREATED", "git-status", "local-operator",
                repo.toString(), "label", "java", "policy", null, null, null, null, now, null, null, null, null, null, null,
                false, "NOT_REQUIRED", now));
        var pid = new java.util.concurrent.atomic.AtomicLong();
        var startedAt = new AtomicReference<Instant>();
        var user = new AtomicReference<String>();
        var executable = new AtomicReference<String>();
        var ready = new CountDownLatch(1);
        var worker = new Thread(() -> executor.runManaged(executionId, "probe", repo, List.of(
                Path.of(System.getProperty("java.home"), "bin", "java").toString(), "-cp", classpath(),
                MissionGitAcceptanceTest.class.getName() + "$Hold"), Map.of(), identity -> {
            pid.set((Long) identity.get("processPid"));
            var text = String.valueOf(identity.get("processStartedAt"));
            startedAt.set(text.isBlank() ? null : Instant.parse(text));
            user.set(String.valueOf(identity.get("processUser")));
            executable.set(String.valueOf(identity.get("processExecutable")));
            ready.countDown();
        }));
        worker.setDaemon(true);
        worker.start();
        assertTrue(ready.await(10, TimeUnit.SECONDS));
        return new Sleeper(executor, worker, executionId, missionId, pid.get(), startedAt.get(), user.get(), executable.get());
    }

    private static String classpath() {
        try {
            return Path.of(MissionGitAcceptanceTest.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toString();
        } catch (java.net.URISyntaxException invalid) {
            throw new IllegalStateException(invalid);
        }
    }

    public static class Hold {
        public static void main(String[] args) throws Exception {
            Thread.sleep(60_000);
        }
    }

    private record Sleeper(DefaultProcessExecutor executor, Thread worker, UUID executionId, UUID mission, long pid,
                           Instant started, String user, String executable) {
        void stop() {
            executor.close();
            try { worker.join(5_000); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        }
    }

    private static final class GateExecutor extends DefaultProcessExecutor {
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);

        @Override
        public Observation runManaged(UUID id, String capability, Path directory, List<String> command,
                                      Map<String, String> environment, java.util.function.Consumer<Map<String, Object>> onStart) {
            entered.countDown();
            try {
                if (!release.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("release timed out");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            }
            return super.runManaged(id, capability, directory, command, environment, onStart);
        }
    }

    @Configuration
    @EnableTransactionManagement
    static class IsolatedDb {
        @Bean
        DataSource dataSource() throws Exception {
            var source = new DriverManagerDataSource();
            source.setUrl(setting("EAP_DB_URL", "jdbc:postgresql://localhost:54321/postgres?currentSchema=eap"));
            source.setUsername(setting("EAP_DB_USERNAME", "postgres"));
            source.setPassword(secret("EAP_DB_PASSWORD", "password:"));
            return source;
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource dataSource) { return new JdbcTemplate(dataSource); }

        @Bean
        PlatformTransactionManager transactionManager(DataSource dataSource) { return new DataSourceTransactionManager(dataSource); }

        @Bean
        MissionStore missions(JdbcTemplate jdbc) { return new JdbcMissionStore(jdbc); }

        @Bean
        MissionExecutionStore executions(JdbcTemplate jdbc) { return new JdbcMissionExecutionStore(jdbc); }

        private static String setting(String env, String fallback) {
            var value = System.getenv(env);
            return value == null || value.isBlank() ? fallback : value;
        }

        private static String secret(String env, String yamlKey) throws Exception {
            var value = System.getenv(env);
            if (value != null && !value.isBlank()) return value;
            var resource = MissionGitAcceptanceTest.class.getResourceAsStream("/application.yml");
            for (var line : new String(resource.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8).split("\n")) {
                var trimmed = line.trim();
                if (!trimmed.startsWith(yamlKey)) continue;
                var marker = "${" + env + ":";
                var start = trimmed.indexOf(marker);
                if (start < 0) continue;
                return trimmed.substring(start + marker.length(), trimmed.lastIndexOf('}'));
            }
            throw new IllegalStateException("数据库口令未配置");
        }
    }
}
