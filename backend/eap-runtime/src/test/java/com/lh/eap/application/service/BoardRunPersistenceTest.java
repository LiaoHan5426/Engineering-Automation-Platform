package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.*;
import com.lh.eap.persistence.mapper.*;
import com.lh.eap.runtime.handler.*;

/** Real PostgreSQL + a newly initialized isolated Git directory; owns only its generated rows. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class BoardRunPersistenceTest {
    @TempDir Path repo;
    private AnnotationConfigApplicationContext context;
    private JdbcTemplate jdbc;
    private BoardTaskService tasks;
    private MissionExecutionStore executions;
    private MissionGitExecutionService git;
    private final String project = "board-run-test-" + UUID.randomUUID();
    private final Queue<Runnable> queue = new ConcurrentLinkedQueue<>();
    private final DefaultProcessExecutor executor = new DefaultProcessExecutor();
    private BoardRunService runs;

    @BeforeEach void setup() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"));
        context = new AnnotationConfigApplicationContext();
        context.registerBean(DataSource.class, () -> new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password")));
        context.register(Db.class); context.refresh();
        jdbc = context.getBean(JdbcTemplate.class); tasks = context.getBean(BoardTaskService.class); executions = context.getBean(MissionExecutionStore.class);
        assertEquals(0, executor.run("init-test-repository", repo, List.of("git", "init")).exitCode());
        Files.writeString(repo.resolve("evidence.txt"), "bounded repository fixture");
        git = git(new RuntimeWorkspace(repo, repo.toString(), ""), executions);
        runs = service(git, queue::add);
    }
    private MissionGitExecutionService git(RuntimeWorkspace workspace, MissionExecutionStore store) {
        var registry = new CapabilityRegistry().register(new GitCapability("status"));
        var handlers = new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry, executor)));
        return new MissionGitExecutionService(context.getBean(MissionStore.class), store, handlers, new CapabilitySettings(jdbc, null), registry, executor, workspace);
    }
    private BoardRunService service(MissionGitExecutionService service, java.util.concurrent.Executor dispatcher) {
        return new BoardRunService(jdbc, tasks, context.getBean(HandoffStore.class), context.getBean(MissionService.class), executions, service, context.getBean(PlatformTransactionManager.class), dispatcher, false);
    }
    private BoardTaskService.Task task() { return tasks.create(new BoardTaskService.Draft(project, "Inspect bounded repository", "", "ready", "Collect Git state", "Review evidence.txt in output", UUID.randomUUID())); }
    private BoardRunService.Start request(BoardTaskService.Task task) throws Exception { return new BoardRunService.Start(project, task.revision(), UUID.randomUUID(), repo.toRealPath().toString()); }
    private ResponseStatusException rejects(Runnable action) { return assertThrows(ResponseStatusException.class, action::run); }

    @Test void runsOnceInTheConfirmedDirectoryAndReopensTheOriginalSnapshotAfterTaskChanges() throws Exception {
        var task = task(); var request = request(task); var run = runs.start(task.id(), request);
        assertEquals("CREATED", run.execution().status()); assertEquals(1, queue.size());
        assertTrue(tasks.list(project).getFirst().executionActive());
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> tasks.update(task.id(), new BoardTaskService.Update(project, 1, "planned", null, null, null, null))).getReason());
        assertEquals(run.execution().id(), runs.start(task.id(), request).execution().id()); assertEquals(1, queue.size());
        assertEquals("BOARD_RUN_ENDPOINT_REQUIRED", rejects(() -> git.start(run.execution().missionId())).getReason());
        var worker = queue.remove(); worker.run(); worker.run();
        var saved = service(git, queue::add).list(task.id(), project).items().getFirst();
        assertEquals("SUCCEEDED", saved.execution().status()); assertEquals(0, saved.execution().exitCode());
        assertTrue(saved.execution().stdout().contains("evidence.txt")); assertEquals(repo.toRealPath().toString(), saved.execution().workspacePath());
        assertEquals("ready", tasks.list(project).getFirst().column()); assertFalse(tasks.list(project).getFirst().executionActive());
        tasks.update(task.id(), new BoardTaskService.Update(project, 1, null, null, null, "A later goal", null));
        assertEquals("Collect Git state", runs.start(task.id(), request).task().goal()); assertTrue(queue.isEmpty());
        assertEquals(404, rejects(() -> runs.list(task.id(), project + "-other")).getStatusCode().value());
        assertEquals("BOARD_RUN_REQUEST_CONFLICT", rejects(() -> runs.start(task.id(), new BoardRunService.Start(project, 2, request.requestId(), request.workspacePath()))).getReason());
        assertEquals("BOARD_REVISION_CONFLICT", rejects(() -> runs.start(task.id(), new BoardRunService.Start(project, 1, UUID.randomUUID(), request.workspacePath()))).getReason());
    }
    @Test void concurrentSameIdentityReturnsOneRunAndDifferentIdentitiesCannotClaimTheTaskTwice() throws Exception {
        for (boolean same : List.of(true, false)) {
            var task = task(); var request = request(task); var other = same ? request : request(task);
            var barrier = new CyclicBarrier(2);
            try (var pool = Executors.newFixedThreadPool(2)) {
                var first = pool.submit(() -> startAt(barrier, task.id(), request));
                var second = pool.submit(() -> startAt(barrier, task.id(), other));
                var a = first.get(15, TimeUnit.SECONDS); var b = second.get(15, TimeUnit.SECONDS);
                if (same) assertEquals(a, b); else assertEquals(1, List.of(a, b).stream().filter("BOARD_EXECUTION_ACTIVE"::equals).count());
            }
            assertEquals(1, runs.list(task.id(), project).items().size());
        }
        assertEquals(2, queue.size());
    }
    private String startAt(CyclicBarrier barrier, UUID task, BoardRunService.Start request) throws Exception {
        barrier.await(5, TimeUnit.SECONDS);
        try { return runs.start(task, request).execution().id().toString(); }
        catch (ResponseStatusException denied) { return denied.getReason(); }
    }
    @Test void denialOrChangedWorkspaceRollsBackHandoffMissionAndRun() throws Exception {
        var task = task(); var request = request(task);
        var denied = service(git(new RuntimeWorkspace(repo, "", ""), executions), queue::add);
        assertEquals("AUTHORIZED_ROOT_MISSING", rejects(() -> denied.start(task.id(), request)).getReason());
        assertEquals("BOARD_WORKSPACE_CHANGED", rejects(() -> runs.start(task.id(), new BoardRunService.Start(project, 1, request.requestId(), request.workspacePath() + "-other"))).getReason());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.handoff WHERE source='board' AND source_ref=?", Integer.class, task.id().toString()));
        assertTrue(queue.isEmpty()); assertTrue(runs.list(task.id(), project).items().isEmpty());
    }
    @Test void restartUnknownBlocksBothDispatchAndAnotherStart() throws Exception {
        var task = task(); var request = request(task); var run = runs.start(task.id(), request);
        var scoped = org.mockito.Mockito.mock(MissionExecutionStore.class, org.mockito.AdditionalAnswers.delegatesTo(executions));
        org.mockito.Mockito.doReturn(List.of(run.execution())).when(scoped).openAll();
        git(new RuntimeWorkspace(repo, repo.toString(), ""), scoped).markRestartUnknown();
        queue.remove().run();
        var saved = runs.list(task.id(), project).items().getFirst();
        assertEquals("CREATED", saved.execution().status()); assertNotNull(saved.execution().unconfirmedReason());
        assertNull(saved.execution().osPid());
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> runs.start(task.id(), new BoardRunService.Start(project, 1, UUID.randomUUID(), request.workspacePath()))).getReason());
    }
    @Test void fullDispatcherPersistsFailureWithoutClaimingSuccess() throws Exception {
        var task = task(); var request = request(task);
        service(git, command -> { throw new RejectedExecutionException(); }).start(task.id(), request);
        var saved = runs.list(task.id(), project).items().getFirst();
        assertEquals("FAILED", saved.execution().status()); assertEquals("BOARD_QUEUE_FULL", saved.execution().stderr());
        assertFalse(tasks.list(project).getFirst().executionActive()); assertEquals("ready", tasks.list(project).getFirst().column());
    }
    @Test void realGitFailureIsPersistedAndDoesNotCompleteTheTask() throws Exception {
        // A separate sibling of the Git root prevents parent repository discovery.
        var outside = Files.createTempDirectory(repo.getParent(), "board-non-git-");
        try {
            var failedGit = git(new RuntimeWorkspace(outside, outside.toString(), ""), executions);
            var service = service(failedGit, queue::add); var task = task();
            service.start(task.id(), new BoardRunService.Start(project, 1, UUID.randomUUID(), outside.toRealPath().toString()));
            queue.remove().run();
            var saved = service.list(task.id(), project).items().getFirst();
            assertEquals("FAILED", saved.execution().status()); assertNotEquals(0, saved.execution().exitCode());
            assertFalse(saved.execution().stderr().isBlank()); assertEquals("ready", tasks.list(project).getFirst().column());
        } finally { Files.deleteIfExists(outside); }
    }
    @AfterEach void cleanup() {
        executor.close();
        if (jdbc != null) {
            var missionIds = jdbc.queryForList("SELECT e.mission_id FROM eap.board_task_run r JOIN eap.board_task t ON t.id=r.task_id JOIN eap.mission_execution e ON e.id=r.execution_id WHERE t.project_id=?", UUID.class, project);
            jdbc.update("DELETE FROM eap.board_task_run WHERE task_id IN (SELECT id FROM eap.board_task WHERE project_id=?)", project);
            for (var id : missionIds) {
                var handoff = jdbc.queryForObject("SELECT handoff_id FROM eap.mission WHERE id=?", UUID.class, id);
                jdbc.update("DELETE FROM eap.mission_execution WHERE mission_id=?", id); jdbc.update("DELETE FROM eap.mission WHERE id=?", id); jdbc.update("DELETE FROM eap.handoff WHERE id=?", handoff);
            }
            jdbc.update("DELETE FROM eap.board_task WHERE project_id=?", project);
        }
        if (context != null) context.close();
    }
    @Configuration @EnableTransactionManagement static class Db {
        @Bean JdbcTemplate jdbc(DataSource source) { return new JdbcTemplate(source); }
        @Bean PlatformTransactionManager manager(DataSource source) { return new DataSourceTransactionManager(source); }
        @Bean BoardTaskService tasks(JdbcTemplate jdbc) { return new BoardTaskService(jdbc); }
        @Bean HandoffStore handoffs(JdbcTemplate jdbc) { return new JdbcHandoffStore(jdbc); }
        @Bean MissionStore missions(JdbcTemplate jdbc) { return new JdbcMissionStore(jdbc); }
        @Bean MissionService missionService(HandoffStore handoffs, MissionStore missions) { return new MissionService(handoffs, missions); }
        @Bean MissionExecutionStore executions(JdbcTemplate jdbc) { return new JdbcMissionExecutionStore(jdbc); }
    }
}
