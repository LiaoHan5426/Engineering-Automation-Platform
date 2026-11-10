package com.lh.eap.application.service;
import com.lh.eap.delivery.JdbcCodeGenerationStore;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.JdbcCodeProposalStore;

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
    private final List<UUID> ownedVersions = new ArrayList<>();

    @BeforeEach void setup() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"));
        context = new AnnotationConfigApplicationContext();
        context.registerBean(DataSource.class, () -> new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password")));
        context.registerBean(RuntimeWorkspace.class, () -> new RuntimeWorkspace(repo, repo.toString()));
        context.registerBean(DefaultProcessExecutor.class, () -> executor);
        context.register(Db.class); context.refresh();
        jdbc = context.getBean(JdbcTemplate.class); tasks = context.getBean(BoardTaskService.class); executions = context.getBean(MissionExecutionStore.class);
        assertEquals(0, executor.run("init-test-repository", repo, List.of("git", "init")).exitCode());
        Files.writeString(repo.resolve("evidence.txt"), "bounded repository fixture");
        git = git(new RuntimeWorkspace(repo, repo.toString()), executions);
        runs = service(git, queue::add);
    }
    private MissionGitExecutionService git(RuntimeWorkspace workspace, MissionExecutionStore store) {
        var registry = new CapabilityRegistry().register(new GitCapability("status"));
        var handlers = new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry, executor)));
        return new MissionGitExecutionService(context.getBean(MissionStore.class), store, handlers, new CapabilitySettings(jdbc, null), registry, executor, workspace);
    }
    private BoardRunService service(MissionGitExecutionService service, java.util.concurrent.Executor dispatcher) {
        return new BoardRunService(jdbc, tasks, context.getBean(HandoffStore.class), context.getBean(MissionService.class), executions, service, context.getBean(PlatformTransactionManager.class), context.getBean(BoardPrototypeService.class), dispatcher, false);
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
        var denied = service(git(new RuntimeWorkspace(repo, ""), executions), queue::add);
        assertEquals("AUTHORIZED_ROOT_MISSING", rejects(() -> denied.start(task.id(), request)).getReason());
        assertEquals("BOARD_WORKSPACE_CHANGED", rejects(() -> runs.start(task.id(), new BoardRunService.Start(project, 1, request.requestId(), request.workspacePath() + "-other"))).getReason());
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.handoff WHERE source='board' AND source_ref=?", Integer.class, task.id().toString()));
        assertTrue(queue.isEmpty()); assertTrue(runs.list(task.id(), project).items().isEmpty());
    }
    @Test void restartUnknownBlocksBothDispatchAndAnotherStart() throws Exception {
        var task = task(); var request = request(task); var run = runs.start(task.id(), request);
        var scoped = org.mockito.Mockito.mock(MissionExecutionStore.class, org.mockito.AdditionalAnswers.delegatesTo(executions));
        org.mockito.Mockito.doReturn(List.of(run.execution())).when(scoped).openAll();
        git(new RuntimeWorkspace(repo, repo.toString()), scoped).markRestartUnknown();
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
            var failedGit = git(new RuntimeWorkspace(outside, outside.toString()), executions);
            var service = service(failedGit, queue::add); var task = task();
            service.start(task.id(), new BoardRunService.Start(project, 1, UUID.randomUUID(), outside.toRealPath().toString()));
            queue.remove().run();
            var saved = service.list(task.id(), project).items().getFirst();
            assertEquals("FAILED", saved.execution().status()); assertNotEquals(0, saved.execution().exitCode());
            assertFalse(saved.execution().stderr().isBlank()); assertEquals("ready", tasks.list(project).getFirst().column());
        } finally { Files.deleteIfExists(outside); }
    }
    private PrototypeVersion version(String title) {
        var version = context.getBean(PrototypeVersionService.class).save(UUID.randomUUID(), "builder-alpha", title, SemanticPrototypeFixture.body("saved body " + title), List.of("review design"));
        ownedVersions.add(version.id()); return version;
    }
    @Test void prototypeLinkIsScopedVersionedAndFrozenInEachRun() throws Exception {
        var task = task(); var first = version("design A"); var second = version("design B");
        var prototypes = context.getBean(BoardPrototypeService.class);
        var linked = prototypes.select(task.id(), new BoardPrototypeService.Selection(project, 1, first.id()));
        assertEquals(first.id(), linked.prototypeVersionId()); assertEquals(2, linked.revision());
        assertEquals(first.id(), new BoardTaskService(jdbc).list(project).getFirst().prototypeVersionId());
        assertEquals(2, prototypes.select(task.id(), new BoardPrototypeService.Selection(project, 2, first.id())).revision());
        var request = request(linked); var run = runs.start(task.id(), request);
        assertEquals(first.id(), run.task().prototype().id()); assertEquals(first.contentHash(), run.task().prototype().contentHash());
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> prototypes.select(task.id(), new BoardPrototypeService.Selection(project, 2, second.id()))).getReason());
        queue.remove().run();
        var changed = prototypes.select(task.id(), new BoardPrototypeService.Selection(project, 2, second.id()));
        assertEquals(second.id(), changed.prototypeVersionId()); assertEquals(3, changed.revision());
        assertEquals(first.id(), runs.start(task.id(), request).task().prototype().id());
        assertEquals(first.contentHash(), service(git, queue::add).list(task.id(), project).items().getFirst().task().prototype().contentHash());
        var next = runs.start(task.id(), request(changed)); assertEquals(second.id(), next.task().prototype().id()); queue.remove().run();
        var detached = prototypes.select(task.id(), new BoardPrototypeService.Selection(project, 3, null));
        assertNull(detached.prototypeVersionId()); assertEquals(4, detached.revision());
        assertEquals(List.of("created", "prototype_linked", "prototype_linked", "prototype_unlinked"), detached.events());
        assertEquals("ready", detached.column()); assertEquals(task.goal(), detached.goal()); assertEquals(task.acceptanceCriteria(), detached.acceptanceCriteria());
    }
    @Test void prototypeSelectionRejectsMissingForeignAndConcurrentChanges() throws Exception {
        var task = task(); var a = version("A"); var b = version("B"); var prototypes = context.getBean(BoardPrototypeService.class);
        assertEquals(404, rejects(() -> prototypes.select(task.id(), new BoardPrototypeService.Selection(project + "-other", 1, a.id()))).getStatusCode().value());
        assertEquals(404, rejects(() -> prototypes.select(task.id(), new BoardPrototypeService.Selection(project, 1, UUID.randomUUID()))).getStatusCode().value());
        assertEquals(1, tasks.list(project).getFirst().revision());
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var futures = List.of(a, b).stream().map(version -> pool.submit(() -> {
                barrier.await(5, TimeUnit.SECONDS);
                try { prototypes.select(task.id(), new BoardPrototypeService.Selection(project, 1, version.id())); return "saved"; }
                catch (ResponseStatusException conflict) { return conflict.getReason(); }
            })).toList();
            assertEquals(Set.of("saved", "BOARD_REVISION_CONFLICT"), Set.of(futures.get(0).get(15, TimeUnit.SECONDS), futures.get(1).get(15, TimeUnit.SECONDS)));
        }
        assertEquals(2, tasks.list(project).getFirst().revision());
    }
    @Test void historicRunSnapshotsWithoutPrototypeStillLoad() throws Exception {
        var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        jdbc.update("UPDATE eap.board_task_run SET task_snapshot=task_snapshot - 'prototype' WHERE execution_id=?", run.execution().id());
        assertNull(runs.list(task.id(), project).items().getFirst().task().prototype());
    }
    private void commitReviewBaseline() throws Exception {
        for (var command : List.of(List.of("git", "add", "evidence.txt"), List.of("git", "-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "review baseline")))
            assertEquals(0, executor.runIsolated("fixture", repo, command, GitCapability.environment()).exitCode());
        Files.writeString(repo.resolve("evidence.txt"), "changed review content\n");
    }
    @Test void reviewPersistsOnceAndDoesNotChangeWithRepositoryTaskOrPrototypeEdits() throws Exception {
        commitReviewBaseline(); var task = task(); var prototype = version("review design");
        task = context.getBean(BoardPrototypeService.class).select(task.id(), new BoardPrototypeService.Selection(project, 1, prototype.id()));
        var run = runs.start(task.id(), request(task)); queue.remove().run();
        var reviews = context.getBean(BoardReviewService.class); var id = task.id(); var execution = run.execution().id();
        assertNull(reviews.get(id, execution, project).evidence());
        var request = new BoardReviewService.Request(project, repo.toRealPath().toString());
        var evidence = reviews.collect(id, execution, request);
        assertTrue(Set.of("CAPTURED", "INCOMPLETE").contains(evidence.snapshot().status())); assertEquals("PASSED", evidence.snapshot().check().status());
        assertTrue(evidence.snapshot().diff().contains("+changed review content"));
        Files.writeString(repo.resolve("evidence.txt"), "later repository edit\n");
        context.getBean(BoardPrototypeService.class).select(id, new BoardPrototypeService.Selection(project, task.revision(), null));
        assertEquals(evidence, reviews.get(id, execution, project).evidence()); assertEquals(evidence, reviews.collect(id, execution, request));
        assertEquals(prototype.id(), runs.list(id, project).items().getFirst().task().prototype().id());
        assertEquals("ready", tasks.list(project).getFirst().column());
        assertFalse(reviews.get(id, execution, project).captureAllowed());
    }
    @Test void concurrentReviewRequestsReturnTheSameImmutableSnapshot() throws Exception {
        commitReviewBaseline(); var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        var reviews = context.getBean(BoardReviewService.class); var request = new BoardReviewService.Request(project, repo.toRealPath().toString());
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var calls = java.util.stream.IntStream.range(0,2).mapToObj(index -> pool.submit(() -> {
                barrier.await(5, TimeUnit.SECONDS); return reviews.collect(task.id(), run.execution().id(), request);
            })).toList();
            assertEquals(calls.get(0).get(20, TimeUnit.SECONDS), calls.get(1).get(20, TimeUnit.SECONDS));
        }
    }
    @Test void reviewRejectsForeignRunsActiveExecutionChangedWorkspaceAndDisabledCapability() throws Exception {
        var task = task(); var run = runs.start(task.id(), request(task)); var other = task();
        var reviews = context.getBean(BoardReviewService.class); var request = new BoardReviewService.Request(project, repo.toRealPath().toString());
        assertEquals(404, rejects(() -> reviews.get(task.id(), run.execution().id(), project + "-other")).getStatusCode().value());
        assertEquals(404, rejects(() -> reviews.get(other.id(), run.execution().id(), project)).getStatusCode().value());
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> reviews.collect(task.id(), run.execution().id(), request)).getReason());
        queue.remove().run();
        assertEquals("BOARD_WORKSPACE_CHANGED", rejects(() -> reviews.collect(task.id(), run.execution().id(), new BoardReviewService.Request(project, "wrong"))).getReason());
        var settings = org.mockito.Mockito.mock(CapabilitySettings.class);
        var denied = new BoardReviewService(jdbc, tasks, executions, git, context.getBean(CapabilityRegistry.class), context.getBean(CapabilityHandlerRegistry.class), settings, context.getBean(GitReviewCapture.class));
        assertEquals("CAPABILITY_DISABLED", denied.get(task.id(), run.execution().id(), project).reason());
        var transaction = new org.springframework.transaction.support.TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        assertEquals("CAPABILITY_DISABLED", rejects(() -> transaction.execute(status -> denied.collect(task.id(), run.execution().id(), request))).getReason());
        assertNull(reviews.get(task.id(), run.execution().id(), project).evidence());
    }
    @Test void missingBaselineIsStoredAsFailedEvidenceWithoutTaskCompletion() throws Exception {
        var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        var reviews = context.getBean(BoardReviewService.class);
        var evidence = reviews.collect(task.id(), run.execution().id(), new BoardReviewService.Request(project, repo.toRealPath().toString()));
        assertEquals("FAILED", evidence.snapshot().status()); assertEquals("NOT_RUN", evidence.snapshot().check().status());
        assertEquals(evidence, reviews.get(task.id(), run.execution().id(), project).evidence());
        assertEquals("ready", tasks.list(project).getFirst().column());
    }
    private BoardVerificationService verification(com.lh.eap.api.ProcessExecutor process, java.util.concurrent.Executor dispatcher) {
        var channels = org.mockito.Mockito.mock(CliChannels.class);
        var binary = LocalBinaries.resolve("git").orElseThrow().toString();
        org.mockito.Mockito.when(channels.channel("vp", "vp")).thenReturn(new CliChannels.Channel("vp", binary, "operator", binary, com.lh.eap.domain.model.CapabilityAvailability.AVAILABLE));
        return new BoardVerificationService(jdbc, tasks, executions, git, context.getBean(CapabilityRegistry.class), context.getBean(CapabilitySettings.class),
            new BoardVerificationPlanSupport(executor, channels, new BoardVerificationSource()), process, context.getBean(PlatformTransactionManager.class), dispatcher);
    }
    private void verificationFixture() throws Exception {
        commitReviewBaseline(); Files.createDirectories(repo.resolve("frontend/node_modules"));
        Files.writeString(repo.resolve("frontend/package.json"), "{}"); Files.writeString(repo.resolve("frontend/source.ts"), "export const source = 1;");
    }
    private com.lh.eap.api.ProcessExecutor passingVerificationProcess() {
        var process = org.mockito.Mockito.mock(com.lh.eap.api.ProcessExecutor.class);
        org.mockito.Mockito.when(process.runIsolated(org.mockito.ArgumentMatchers.eq("vp"), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyList(), org.mockito.ArgumentMatchers.anyMap()))
            .thenReturn(new com.lh.eap.api.Observation("vp", true, 0, "fixture check", "", Map.of("executorStatus", "SUCCEEDED", "processExited", true, "processTreeCleanup", true)));
        return process;
    }
    @Test void verificationPersistsOnceBlocksTaskAndPrototypeAndReplaysWithoutTaskCompletion() throws Exception {
        verificationFixture(); var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        var process = passingVerificationProcess(); var service = verification(process, queue::add);
        var plan = service.plan(task.id(), run.execution().id(), new BoardVerificationService.Request(project, repo.toRealPath().toString()));
        var request = new BoardVerificationService.Start(project, plan.workspacePath(), plan.planHash());
        var first = service.start(task.id(), run.execution().id(), request);
        assertEquals("QUEUED", first.status()); assertEquals(first, service.start(task.id(), run.execution().id(), request)); assertEquals(1, queue.size());
        assertTrue(tasks.list(project).getFirst().executionActive());
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> tasks.update(task.id(), new BoardTaskService.Update(project, 1, "planned", null, null, null, null))).getReason());
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> context.getBean(BoardPrototypeService.class).select(task.id(), new BoardPrototypeService.Selection(project, 1, null))).getReason());
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> context.getBean(BoardReviewService.class).collect(task.id(), run.execution().id(), new BoardReviewService.Request(project, plan.workspacePath()))).getReason());
        assertEquals(404, rejects(() -> service.get(task.id(), run.execution().id(), project + "-foreign")).getStatusCode().value());
        assertEquals(404, rejects(() -> service.get(task.id(), UUID.randomUUID(), project)).getStatusCode().value());
        var worker = queue.remove(); worker.run(); worker.run();
        var saved = verification(process, queue::add).get(task.id(), run.execution().id(), project).record();
        assertEquals("PASSED", saved.status()); assertEquals(3, saved.checks().size()); assertFalse(tasks.list(project).getFirst().executionActive());
        assertEquals(saved, service.start(task.id(), run.execution().id(), request)); assertEquals("ready", tasks.list(project).getFirst().column());
        org.mockito.Mockito.verify(process, org.mockito.Mockito.times(3)).runIsolated(org.mockito.ArgumentMatchers.eq("vp"), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyList(), org.mockito.ArgumentMatchers.anyMap());
        assertEquals("BOARD_VERIFICATION_REQUEST_CONFLICT", rejects(() -> service.start(task.id(), run.execution().id(), new BoardVerificationService.Start(project, plan.workspacePath(), "e".repeat(64)))).getReason());
    }
    @Test void concurrentVerificationIsDeduplicatedAndWorkspaceConstraintBlocksOtherTasks() throws Exception {
        verificationFixture(); var one = task(); var first = runs.start(one.id(), request(one)); queue.remove().run();
        var two = task(); var second = runs.start(two.id(), request(two)); queue.remove().run();
        var service = verification(passingVerificationProcess(), queue::add);
        var plan = service.plan(one.id(), first.execution().id(), new BoardVerificationService.Request(project, repo.toRealPath().toString()));
        var request = new BoardVerificationService.Start(project, plan.workspacePath(), plan.planHash()); var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var calls = java.util.stream.IntStream.range(0, 2).mapToObj(index -> pool.submit(() -> { barrier.await(5, TimeUnit.SECONDS); return service.start(one.id(), first.execution().id(), request); })).toList();
            assertEquals(calls.get(0).get(30, TimeUnit.SECONDS), calls.get(1).get(30, TimeUnit.SECONDS));
        }
        assertEquals(1, queue.size());
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", rejects(() -> service.start(two.id(), second.execution().id(), request)).getReason());
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", rejects(() -> runs.start(two.id(), new BoardRunService.Start(project, 1, UUID.randomUUID(), plan.workspacePath()))).getReason());
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", rejects(() -> context.getBean(BoardReviewService.class).collect(two.id(), second.execution().id(), new BoardReviewService.Request(project, plan.workspacePath()))).getReason());
        var persisted = jdbc.queryForObject("SELECT verification_snapshot::text FROM eap.board_task_run WHERE execution_id=?", String.class, first.execution().id());
        assertThrows(org.springframework.dao.DuplicateKeyException.class, () -> jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE execution_id=?", persisted, second.execution().id()));
    }
    @Test void restartUnknownPreservesVerificationProgressAndNeverDispatchesAgain() throws Exception {
        verificationFixture(); var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        var process = passingVerificationProcess(); var service = verification(process, queue::add);
        var plan = service.plan(task.id(), run.execution().id(), new BoardVerificationService.Request(project, repo.toRealPath().toString()));
        service.start(task.id(), run.execution().id(), new BoardVerificationService.Start(project, plan.workspacePath(), plan.planHash()));
        // Execute the production recovery SQL scoped strictly to this test's row, never other users' work.
        var scoped = org.mockito.Mockito.mock(JdbcTemplate.class);
        org.mockito.Mockito.doAnswer(call -> jdbc.update((String)call.getArgument(0) + " AND task_id=?", task.id())).when(scoped).update(org.mockito.ArgumentMatchers.anyString());
        new BoardVerificationService(scoped, tasks, executions, git, context.getBean(CapabilityRegistry.class), context.getBean(CapabilitySettings.class), org.mockito.Mockito.mock(BoardVerificationPlanSupport.class), process, context.getBean(PlatformTransactionManager.class), queue::add).markRestartUnknown();
        queue.remove().run();
        assertEquals("UNKNOWN", service.get(task.id(), run.execution().id(), project).record().status());
        assertTrue(tasks.list(project).getFirst().executionActive());
        org.mockito.Mockito.verifyNoInteractions(process);
    }
    @Test void queuedVerificationDetectsEditedSourceBeforeExecutingAnyChecks() throws Exception {
        verificationFixture(); var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        var process = passingVerificationProcess(); var service = verification(process, queue::add);
        var plan = service.plan(task.id(), run.execution().id(), new BoardVerificationService.Request(project, repo.toRealPath().toString()));
        service.start(task.id(), run.execution().id(), new BoardVerificationService.Start(project, plan.workspacePath(), plan.planHash()));
        Files.writeString(repo.resolve("frontend/source.ts"), "export const source = 2;"); queue.remove().run();
        assertEquals("STALE", service.get(task.id(), run.execution().id(), project).record().status());
        org.mockito.Mockito.verifyNoInteractions(process); assertFalse(tasks.list(project).getFirst().executionActive());
    }
    @Test void preflightPlanUnknownSurvivesOuterRollbackAndBlocksWorkspace() throws Exception {
        assertPreflightUnknownPersists(false);
    }
    @Test void preflightStartUnknownSurvivesOuterRollbackAndBlocksWorkspace() throws Exception {
        assertPreflightUnknownPersists(true);
    }
    private void assertPreflightUnknownPersists(boolean start) throws Exception {
        var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        var other = task(); var otherRun = runs.start(other.id(), request(other)); queue.remove().run();
        var plans = org.mockito.Mockito.mock(BoardVerificationPlanSupport.class);
        org.mockito.Mockito.when(plans.availability()).thenReturn("");
        org.mockito.Mockito.when(plans.prepare(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
            .thenThrow(BoardVerificationSource.denied("BOARD_VERIFICATION_PROCESS_UNKNOWN"));
        var process = passingVerificationProcess();
        var settings = org.mockito.Mockito.mock(CapabilitySettings.class);
        org.mockito.Mockito.when(settings.enabled(org.mockito.ArgumentMatchers.anyString())).thenReturn(true);
        var service = new BoardVerificationService(jdbc, tasks, executions, git, context.getBean(CapabilityRegistry.class), settings,
            plans, process, context.getBean(PlatformTransactionManager.class), queue::add);
        var workspace = repo.toRealPath().toString();
        var outer = new org.springframework.transaction.support.TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        assertEquals("BOARD_VERIFICATION_PROCESS_UNKNOWN", rejects(() -> outer.execute(status -> {
            if (start) return service.start(task.id(), run.execution().id(), new BoardVerificationService.Start(project, workspace, "a".repeat(64)));
            return service.plan(task.id(), run.execution().id(), new BoardVerificationService.Request(project, workspace));
        })).getReason());
        var page = service.get(task.id(), run.execution().id(), project);
        assertEquals("UNKNOWN", page.record().status()); assertFalse(page.prepareAllowed());
        assertNull(page.record().plan()); assertEquals(workspace, page.record().workspacePath());
        assertTrue(tasks.find(task.id(), project, false).executionActive());
        assertTrue(tasks.hasActiveWorkspace(workspace));
        assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> tasks.update(task.id(), new BoardTaskService.Update(project, 1, "planned", null, null, null, null))).getReason());
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", rejects(() -> service.plan(other.id(), otherRun.execution().id(), new BoardVerificationService.Request(project, workspace))).getReason());
        var json = jdbc.queryForObject("SELECT verification_snapshot::text FROM eap.board_task_run WHERE execution_id=?", String.class, run.execution().id());
        assertThrows(org.springframework.dao.DuplicateKeyException.class, () -> jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE execution_id=?", json, otherRun.execution().id()));
        org.mockito.Mockito.verifyNoInteractions(process); assertTrue(queue.isEmpty());
    }
    @Test void externalDeliveryPersistsEvidenceAndOnlyExplicitAcceptanceCompletesTask() throws Exception {
        verificationFixture();
        assertEquals(0, executor.runIsolated("fixture", repo, List.of("git", "add", "frontend"), GitCapability.environment()).exitCode());
        assertEquals(0, executor.runIsolated("fixture", repo, List.of("git", "-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "frontend baseline"), GitCapability.environment()).exitCode());
        Files.writeString(repo.resolve("frontend/source.ts"), "export const source = 2;");
        var task = task(); var run = runs.start(task.id(), request(task)); queue.remove().run();
        var verification = verification(passingVerificationProcess(), queue::add);
        var plan = verification.plan(task.id(), run.execution().id(), new BoardVerificationService.Request(project, repo.toRealPath().toString()));
        verification.start(task.id(), run.execution().id(), new BoardVerificationService.Start(project, plan.workspacePath(), plan.planHash())); queue.remove().run();
        assertEquals("PASSED", verification.get(task.id(), run.execution().id(), project).record().status(), verification.get(task.id(), run.execution().id(), project).record().reason());
        var type = assertDoesNotThrow(() -> Class.forName("com.lh.eap.application.service.BoardDeliveryService"), "delivery service missing");
        var service = type.getConstructor(JdbcTemplate.class, BoardTaskService.class, MissionExecutionStore.class, MissionGitExecutionService.class, CapabilityRegistry.class, BoardVerificationService.class, BoardDeliveryCapture.class).newInstance(jdbc, tasks, executions, git, context.getBean(CapabilityRegistry.class), verification, new BoardDeliveryCapture(executor, new BoardVerificationSource()));
        var requestType = Class.forName(type.getName()+"$Request");
        var request = requestType.getConstructor(String.class, long.class, String.class, UUID.class, List.class, String.class).newInstance(project, 1L, plan.workspacePath(), UUID.randomUUID(), List.of("frontend/source.ts"), "manual edit");
        var delivery = type.getMethod("submit", UUID.class, UUID.class, requestType).invoke(service, task.id(), run.execution().id(), request);
        assertEquals(delivery, type.getMethod("submit", UUID.class, UUID.class, requestType).invoke(service, task.id(), run.execution().id(), request));
        var tree = tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(delivery);
        assertEquals("EXTERNAL_MANUAL", tree.get("source").asText());
        assertEquals("export const source = 1;", tree.get("files").get(0).get("before").asText());
        assertEquals("acceptance", tasks.find(task.id(), project, false).column());
        assertEquals(2, tasks.find(task.id(), project, false).revision());
        assertEquals("BOARD_EXECUTION_EVIDENCE_REQUIRED", rejects(() -> tasks.update(task.id(), new BoardTaskService.Update(project, 2, "done", null, null, null, null))).getReason());
        var decisionType = Class.forName(type.getName()+"$Decide");
        var decision = decisionType.getConstructors()[0].newInstance(project, 2L, UUID.randomUUID(), UUID.fromString(tree.get("id").asText()), "ACCEPT", true, true, "reviewed locally");
        var saved = type.getMethod("decide", UUID.class, UUID.class, decisionType).invoke(service, task.id(), run.execution().id(), decision);
        assertEquals(saved, type.getMethod("decide", UUID.class, UUID.class, decisionType).invoke(service, task.id(), run.execution().id(), decision));
        assertEquals("done", tasks.find(task.id(), project, false).column()); assertEquals(3, tasks.find(task.id(), project, false).revision());
    }
    private record DeliveryFixture(BoardTaskService.Task task, UUID execution, BoardDeliveryService service, BoardDeliveryService.Request request, BoardVerificationService verification) {}
    private DeliveryFixture deliveryFixture(com.lh.eap.api.ProcessExecutor captureExecutor) throws Exception {
        return deliveryFixture(captureExecutor, () -> {});
    }
    private DeliveryFixture deliveryFixture(com.lh.eap.api.ProcessExecutor captureExecutor, Runnable beforeRun) throws Exception {
        return deliveryFixture(captureExecutor, task -> beforeRun.run());
    }
    private DeliveryFixture deliveryFixture(com.lh.eap.api.ProcessExecutor captureExecutor, java.util.function.Consumer<BoardTaskService.Task> beforeRun) throws Exception {
        verificationFixture();
        assertEquals(0, executor.runIsolated("fixture", repo, List.of("git", "add", "frontend"), GitCapability.environment()).exitCode());
        assertEquals(0, executor.runIsolated("fixture", repo, List.of("git", "-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "frontend baseline"), GitCapability.environment()).exitCode());
        Files.writeString(repo.resolve("frontend/source.ts"), "export const source = 2;");
                var task = task(); beforeRun.accept(task);
                var run = runs.start(task.id(), request(task)); queue.remove().run();
                var verification = verification(passingVerificationProcess(), queue::add);
                var plan = verification.plan(task.id(), run.execution().id(), new BoardVerificationService.Request(project, repo.toRealPath().toString()));
                verification.start(task.id(), run.execution().id(), new BoardVerificationService.Start(project, plan.workspacePath(), plan.planHash())); queue.remove().run();
                assertEquals("PASSED", verification.get(task.id(), run.execution().id(), project).record().status());
        return new DeliveryFixture(task, run.execution().id(), new BoardDeliveryService(jdbc, tasks, executions, git, context.getBean(CapabilityRegistry.class), verification, new BoardDeliveryCapture(captureExecutor, new BoardVerificationSource())), new BoardDeliveryService.Request(project, 1, plan.workspacePath(), UUID.randomUUID(), List.of("frontend/source.ts"), "manual change"), verification);
    }
    @Test void deliveryUnknownPersistsAfterOuterRollbackAndBlocksTheWorkspace() throws Exception {
        var process = org.mockito.Mockito.mock(com.lh.eap.api.ProcessExecutor.class);
        org.mockito.Mockito.when(process.runIsolated(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyList(), org.mockito.ArgumentMatchers.anyMap()))
            .thenReturn(new com.lh.eap.api.Observation("git-status", false, -1, "", "", Map.of("processTreeCleanup", false)));
        var fixture = deliveryFixture(process);
        var outer = new org.springframework.transaction.support.TransactionTemplate(context.getBean(PlatformTransactionManager.class));
        assertEquals("BOARD_VERIFICATION_PROCESS_UNKNOWN", rejects(() -> outer.execute(status -> fixture.service().submit(fixture.task().id(), fixture.execution(), fixture.request()))).getReason());
        assertEquals("UNKNOWN", fixture.verification().get(fixture.task().id(), fixture.execution(), project).record().status());
        assertTrue(tasks.hasActiveWorkspace(fixture.request().workspacePath()));
        assertNull(fixture.service().get(fixture.task().id(), fixture.execution(), project).record());
        assertEquals("ready", tasks.find(fixture.task().id(), project, false).column());
    }
    @Test void deliveryRejectAllowsStaleSourceButAcceptAndOrdinaryEditingDoNot() throws Exception {
        var f = deliveryFixture(executor); var delivery = f.service().submit(f.task().id(), f.execution(), f.request());
        Files.writeString(repo.resolve("frontend/source.ts"), "export const source = 3;");
        assertEquals("BOARD_EXECUTION_EVIDENCE_REQUIRED", rejects(() -> tasks.update(f.task().id(), new BoardTaskService.Update(project, 2, null, "changed", null, null, null))).getReason());
        assertEquals("BOARD_EXECUTION_EVIDENCE_REQUIRED", rejects(() -> context.getBean(BoardPrototypeService.class).select(f.task().id(), new BoardPrototypeService.Selection(project, 2, null))).getReason());
        var accept = new BoardDeliveryService.Decide(project, 2, UUID.randomUUID(), delivery.id(), "ACCEPT", true, true, "checked");
        assertEquals("BOARD_DELIVERY_SOURCE_STALE", rejects(() -> f.service().decide(f.task().id(), f.execution(), accept)).getReason());
        assertNull(f.service().get(f.task().id(), f.execution(), project).record().decision());
        var reject = new BoardDeliveryService.Decide(project, 2, UUID.randomUUID(), delivery.id(), "REJECT", false, false, "source changed");
        assertEquals("REJECT", f.service().decide(f.task().id(), f.execution(), reject).decision().decision());
        assertEquals("ready", tasks.find(f.task().id(), project, false).column());
        assertEquals(delivery.files(), f.service().get(f.task().id(), f.execution(), project).record().files());
        assertEquals("BOARD_DELIVERY_REQUEST_CONFLICT", rejects(() -> f.service().decide(f.task().id(), f.execution(), accept)).getReason());
    }
    @Test void concurrentDeliveryDecisionsSerializeAndOnlyOneRevisionIsApplied() throws Exception {
        var f = deliveryFixture(executor); var delivery = f.service().submit(f.task().id(), f.execution(), f.request());
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var calls = java.util.stream.IntStream.range(0,2).mapToObj(i -> pool.submit(() -> {
                barrier.await(5, TimeUnit.SECONDS);
                try { return f.service().decide(f.task().id(), f.execution(), new BoardDeliveryService.Decide(project, 2, UUID.randomUUID(), delivery.id(), "REJECT", false, false, "not accepted")).decision().decision(); }
                catch (ResponseStatusException denied) { return denied.getReason(); }
            })).toList();
            assertEquals(Set.of("REJECT", "BOARD_DELIVERY_REQUEST_CONFLICT"), Set.of(calls.get(0).get(20,TimeUnit.SECONDS), calls.get(1).get(20,TimeUnit.SECONDS)));
        }
        assertEquals(3, tasks.find(f.task().id(), project, false).revision());
    }
    @Test void deliveryReadsAndIdempotentRetriesNeverRunProcessesAndAreScoped() throws Exception {
        var f = deliveryFixture(executor); var delivery = f.service().submit(f.task().id(), f.execution(), f.request());
        var process = org.mockito.Mockito.mock(com.lh.eap.api.ProcessExecutor.class);
        var service = new BoardDeliveryService(jdbc, tasks, executions, git, context.getBean(CapabilityRegistry.class), f.verification(), new BoardDeliveryCapture(process,new BoardVerificationSource()));
        assertEquals(delivery, service.get(f.task().id(), f.execution(), project).record());
        assertEquals(delivery, service.submit(f.task().id(), f.execution(), f.request()));
        assertEquals(404, rejects(() -> service.get(f.task().id(), f.execution(), project+"-foreign")).getStatusCode().value());
        assertEquals(404, rejects(() -> service.get(f.task().id(), UUID.randomUUID(), project)).getStatusCode().value());
        assertEquals("BOARD_DELIVERY_REQUEST_CONFLICT", rejects(() -> service.submit(f.task().id(), f.execution(), new BoardDeliveryService.Request(project,1,f.request().workspacePath(),f.request().requestId(),f.request().paths(),"different"))).getReason());
        assertThrows(IllegalArgumentException.class, () -> service.decide(f.task().id(), f.execution(), new BoardDeliveryService.Decide(project,2,UUID.randomUUID(),delivery.id(),"ACCEPT",false,true,"unchecked")));
        assertThrows(IllegalArgumentException.class, () -> service.decide(f.task().id(), f.execution(), new BoardDeliveryService.Decide(project,2,UUID.randomUUID(),delivery.id(),"REJECT",false,false," ")));
        org.mockito.Mockito.verifyNoInteractions(process);
    }
    @Test void deliveryCannotReuseVerificationAfterTaskOrPrototypeChange() throws Exception {
        var f = deliveryFixture(executor);
        tasks.update(f.task().id(), new BoardTaskService.Update(project,1,null,null,null,"new goal",null));
        var request = new BoardDeliveryService.Request(project,2,f.request().workspacePath(),UUID.randomUUID(),f.request().paths(),"manual");
        assertEquals("BOARD_DELIVERY_TASK_STALE", rejects(() -> f.service().submit(f.task().id(),f.execution(),request)).getReason());
        assertFalse(f.service().get(f.task().id(),f.execution(),project).prepareAllowed());
    }
    @Test void acceptanceUnknownPreservesDeliveryAndDurablyBlocksFurtherDecisions() throws Exception {
        var f = deliveryFixture(executor); var delivery = f.service().submit(f.task().id(),f.execution(),f.request());
        var process = org.mockito.Mockito.mock(com.lh.eap.api.ProcessExecutor.class);
        org.mockito.Mockito.when(process.runIsolated(org.mockito.ArgumentMatchers.anyString(),org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.anyList(),org.mockito.ArgumentMatchers.anyMap())).thenThrow(new IllegalStateException("unconfirmed"));
        var service = new BoardDeliveryService(jdbc,tasks,executions,git,context.getBean(CapabilityRegistry.class),f.verification(),new BoardDeliveryCapture(process,new BoardVerificationSource()));
        var accept = new BoardDeliveryService.Decide(project,2,UUID.randomUUID(),delivery.id(),"ACCEPT",true,true,"checked");
        assertEquals("BOARD_VERIFICATION_PROCESS_UNKNOWN",rejects(() -> service.decide(f.task().id(),f.execution(),accept)).getReason());
        assertEquals(delivery,service.get(f.task().id(),f.execution(),project).record());
        assertTrue(tasks.hasActiveWorkspace(f.request().workspacePath()));
        assertEquals("acceptance",tasks.find(f.task().id(),project,false).column());
        assertEquals("BOARD_EXECUTION_ACTIVE",rejects(() -> service.decide(f.task().id(),f.execution(),new BoardDeliveryService.Decide(project,2,UUID.randomUUID(),delivery.id(),"REJECT",false,false,"unknown"))).getReason());
    }
    @Test void acceptanceRechecksEvidencePathsAndNestedRepositoryBoundaries() throws Exception {
        var f=deliveryFixture(executor); var delivery=f.service().submit(f.task().id(),f.execution(),f.request());
        Files.createDirectories(repo.resolve("frontend/.git"));
        var accept=new BoardDeliveryService.Decide(project,2,UUID.randomUUID(),delivery.id(),"ACCEPT",true,true,"reviewed");
        assertEquals("BOARD_DELIVERY_PATH_DENIED", rejects(()->f.service().decide(f.task().id(),f.execution(),accept)).getReason());
        assertEquals("acceptance",tasks.find(f.task().id(),project,false).column());
    }
    private com.lh.eap.delivery.JdbcCodeProposalStore codeStore() {
        return new com.lh.eap.delivery.JdbcCodeProposalStore(jdbc, context.getBean(PlatformTransactionManager.class));
    }
    private com.lh.eap.delivery.CodeChangeService codeChanges() {
        return new com.lh.eap.delivery.CodeChangeService(new RuntimeWorkspace(repo, repo.toString()), null, null,
                new com.lh.eap.delivery.JdbcCodeGenerationStore(jdbc, context.getBean(PlatformTransactionManager.class)), codeStore());
    }
    private com.lh.eap.delivery.CodeChangeService.Proposal codeProposal(UUID conversation) {
        var changes = codeChanges(); var generation = changes.prepareGeneration(project, conversation, "Page.vue", "", "");
        return changes.proposePrepared(project, conversation, generation.id(),
                "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", true);
    }
    @Test void codeIntentBlocksBoardRunVerificationReviewDeliveryAndRestartPreservesPassedEvidence() throws Exception {
        var fixture = deliveryFixture(executor);
        var other = task(); var otherRun = runs.start(other.id(), request(other)); queue.remove().run();
        var third = task(); var thirdRequest = request(third);
        var conversation = UUID.randomUUID(); var proposal = codeProposal(conversation);
        assertTrue(codeStore().claim(project, conversation, proposal.id()));
        assertEquals("CODE_WORKSPACE_BUSY", rejects(() -> runs.start(third.id(), thirdRequest)).getReason());
        assertEquals("CODE_WORKSPACE_BUSY", rejects(() -> fixture.verification().plan(other.id(), otherRun.execution().id(),
                new BoardVerificationService.Request(project, thirdRequest.workspacePath()))).getReason());
        assertEquals("CODE_WORKSPACE_BUSY", rejects(() -> context.getBean(BoardReviewService.class).collect(other.id(), otherRun.execution().id(),
                new BoardReviewService.Request(project, thirdRequest.workspacePath()))).getReason());
        assertEquals("BOARD_VERIFICATION_WORKSPACE_BUSY", rejects(() -> fixture.service().submit(fixture.task().id(), fixture.execution(), fixture.request())).getReason());
        var original = fixture.verification().get(fixture.task().id(), fixture.execution(), project).record();
        assertEquals("PASSED", original.status());
        codeChanges().recoverInterruptedApplications();
        assertEquals("UNKNOWN", codeStore().find(project, conversation, proposal.id()).orElseThrow().status());
        assertEquals(original, fixture.verification().get(fixture.task().id(), fixture.execution(), project).record());
        assertEquals("CODE_WORKSPACE_BUSY", rejects(() -> runs.start(third.id(), thirdRequest)).getReason());
        assertFalse(Files.exists(repo.resolve("Page.vue")));
    }
    @Test void activeBoardRunAndVerificationBlockCodeApplyAndCompletedVerificationDoesNotBecomeAttribution() throws Exception {
        verificationFixture(); var task = task(); var request = request(task); var run = runs.start(task.id(), request);
        var conversation = UUID.randomUUID(); var proposal = codeProposal(conversation);
        assertEquals("CODE_WORKSPACE_BUSY", rejects(() -> codeChanges().apply(project, conversation, proposal.id(), true)).getReason());
        assertEquals("PROPOSED", codeStore().find(project, conversation, proposal.id()).orElseThrow().status());
        queue.remove().run();
        var verification = verification(passingVerificationProcess(), queue::add);
        var plan = verification.plan(task.id(), run.execution().id(), new BoardVerificationService.Request(project, request.workspacePath()));
        verification.start(task.id(), run.execution().id(), new BoardVerificationService.Start(project, plan.workspacePath(), plan.planHash()));
        assertEquals("CODE_WORKSPACE_BUSY", rejects(() -> codeChanges().apply(project, conversation, proposal.id(), true)).getReason());
        assertFalse(Files.exists(repo.resolve("Page.vue")));
        queue.remove().run();
        var evidence = verification.get(task.id(), run.execution().id(), project).record();
        assertEquals("APPLIED", codeChanges().apply(project, conversation, proposal.id(), true).status());
        assertEquals(evidence, verification.get(task.id(), run.execution().id(), project).record());
        assertEquals("ready", tasks.list(project).getFirst().column());
    }
    private record AppliedDeliveryFixture(DeliveryFixture fixture, BoardDeliveryService.Request request, com.lh.eap.delivery.CodeChangeService.Proposal proposal) {}
    private AppliedDeliveryFixture appliedDeliveryFixture() throws Exception {
        assertTrue(jdbc.queryForObject("SELECT pg_get_constraintdef(oid) LIKE '%CHAT_APPLIED_POST_HOC%' FROM pg_constraint WHERE conname='board_delivery_shape' AND conrelid='eap.board_task_run'::regclass", Boolean.class), "V15 not loaded: application delivery persistence is blocked; do not reset/repair the database");
        var conversation = UUID.randomUUID();
        var proposal = new java.util.concurrent.atomic.AtomicReference<com.lh.eap.delivery.CodeChangeService.Proposal>();
        var principal = com.lh.eap.ai.AiConversationRegistry.PRINCIPAL;
        var f = deliveryFixture(executor, () -> {
            var changes = codeChanges();
            var generation = changes.prepareGeneration(principal, conversation, "frontend/source.ts", "", "");
            proposal.set(changes.proposePrepared(principal, conversation, generation.id(), "{\"files\":[{\"path\":\"frontend/source.ts\",\"content\":\"export const source = 3;\"}]}", true));
            assertEquals("APPLIED", changes.apply(principal, conversation, proposal.get().id(), true).status());
            var persisted = codeStore().find(principal, conversation, proposal.get().id()).orElseThrow();
            assertNotNull(persisted.startedAt()); assertNotNull(persisted.finishedAt());
        });
        var request = new BoardDeliveryService.Request(project, 1, f.request().workspacePath(), UUID.randomUUID(), f.request().paths(), "explicit post hoc test", new BoardDeliveryService.ApplicationRef(conversation, proposal.get().id()));
        return new AppliedDeliveryFixture(f, request, proposal.get());
    }
    @Test void preboundDeliveryUsesOriginalTaskRevisionAndAcceptsAfterSubmitIncrement() throws Exception {
        var conversation = UUID.randomUUID();
        var proposal = new java.util.concurrent.atomic.AtomicReference<com.lh.eap.delivery.CodeChangeService.Proposal>();
        var principal = com.lh.eap.ai.AiConversationRegistry.PRINCIPAL;
        var f = deliveryFixture(executor, task -> {
            var changes = codeChanges();
            var generation = changes.prepareGeneration(principal, conversation, "frontend/source.ts", "", "",
                    new com.lh.eap.api.TaskRef(project, task.id(), task.revision()));
            proposal.set(changes.proposePrepared(principal, conversation, generation.id(), "{\"files\":[{\"path\":\"frontend/source.ts\",\"content\":\"export const source = 3;\"}]}", true));
            assertEquals("APPLIED", changes.apply(principal, conversation, proposal.get().id(), true).status());
        });
        var request = new BoardDeliveryService.Request(project, 1, f.request().workspacePath(), UUID.randomUUID(), f.request().paths(), "prebound fixture",
                new BoardDeliveryService.ApplicationRef(conversation, proposal.get().id()));
        var service = applicationDeliveryService(f, executor);
        var delivery = service.submit(f.task().id(), f.execution(), request);
        assertEquals("CHAT_APPLIED_PREBOUND", delivery.source());
        assertEquals("PREBOUND", delivery.applicationEvidence().association());
        assertEquals(tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(proposal.get().generation()).path("taskBinding"),
                tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(delivery.applicationEvidence()).path("taskBinding"));
        assertEquals(2, tasks.find(f.task().id(), project, false).revision());
        for (String expression : List.of("delivery_snapshot #- '{applicationEvidence,taskBinding}'",
                "jsonb_set(delivery_snapshot,'{applicationEvidence,association}','\"POST_HOC\"'::jsonb)",
                "jsonb_set(delivery_snapshot,'{applicationEvidence,taskBinding,revision}','2'::jsonb)"))
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class, () -> jdbc.update(
                    "UPDATE eap.board_task_run SET delivery_snapshot=" + expression + " WHERE execution_id=?", f.execution()));
        var accepted = service.decide(f.task().id(), f.execution(), new BoardDeliveryService.Decide(project, 2, UUID.randomUUID(), delivery.id(), "ACCEPT", true, true, "test only"));
        assertEquals("ACCEPT", accepted.decision().decision());
        assertEquals(delivery.applicationEvidence(), accepted.applicationEvidence());
    }
    @Test void boundApplicationCannotBeAttachedToAnotherTaskWithIdenticalTextAndRevision() throws Exception {
        var conversation = UUID.randomUUID();
        var proposal = new java.util.concurrent.atomic.AtomicReference<com.lh.eap.delivery.CodeChangeService.Proposal>();
        var principal = com.lh.eap.ai.AiConversationRegistry.PRINCIPAL;
        var f = deliveryFixture(executor, ignored -> {
            var original = task(); var changes = codeChanges();
            var generation = changes.prepareGeneration(principal, conversation, "frontend/source.ts", "", "",
                    new com.lh.eap.api.TaskRef(project, original.id(), original.revision()));
            proposal.set(changes.proposePrepared(principal, conversation, generation.id(), "{\"files\":[{\"path\":\"frontend/source.ts\",\"content\":\"export const source = 3;\"}]}", true));
            changes.apply(principal, conversation, proposal.get().id(), true);
        });
        var request = new BoardDeliveryService.Request(project, 1, f.request().workspacePath(), UUID.randomUUID(), f.request().paths(), "mismatch fixture",
                new BoardDeliveryService.ApplicationRef(conversation, proposal.get().id()));
        var service = applicationDeliveryService(f, executor);
        assertEquals("BOARD_DELIVERY_APPLICATION_TASK_MISMATCH", rejects(() -> service.submit(f.task().id(), f.execution(), request)).getReason());
        assertNull(f.service().get(f.task().id(), f.execution(), project).record());
        assertEquals("ready", tasks.find(f.task().id(), project, false).column());
    }

    @Test void boundApplyingAndUnknownBlockPrototypeRunAndVerificationOnSameTask() throws Exception {
        var f = deliveryFixture(executor); var task = f.task(); var conversation = UUID.randomUUID();
        var unverifiedRun = runs.start(task.id(), request(task)); queue.remove().run();
        var changes = codeChanges();
        var generation = changes.prepareGeneration(project, conversation, "frontend/source.ts", "", "",
                new com.lh.eap.api.TaskRef(project, task.id(), task.revision()));
        var proposal = changes.proposePrepared(project, conversation, generation.id(), "{\"files\":[{\"path\":\"frontend/source.ts\",\"content\":\"export const source = 3;\"}]}", true);
        assertTrue(codeStore().claim(project, conversation, proposal.id()));
        for (String status : List.of("APPLYING", "UNKNOWN")) {
            assertTrue(tasks.list(project).getFirst().executionActive());
            assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> context.getBean(BoardPrototypeService.class).select(task.id(), new BoardPrototypeService.Selection(project, 1, null))).getReason());
            var request = request(task);
            assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> runs.start(task.id(), request)).getReason());
            assertEquals("BOARD_EXECUTION_ACTIVE", rejects(() -> f.verification().plan(task.id(), unverifiedRun.execution().id(), new BoardVerificationService.Request(project, request.workspacePath()))).getReason());
            if (status.equals("APPLYING")) changes.recoverInterruptedApplications();
        }
    }
    @Test void appliedChatDeliveryPersistsPostHocEvidenceAndReplaysAfterReconstruction() throws Exception {
        var fixture = appliedDeliveryFixture(); var f = fixture.fixture(); var request = fixture.request();
        var service = applicationDeliveryService(f, executor);
        var delivery = service.submit(f.task().id(), f.execution(), request);
        var json = tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(delivery);
        assertEquals("CHAT_APPLIED_POST_HOC", delivery.source());
        assertEquals("POST_HOC", json.path("applicationEvidence").path("association").asString());
        assertEquals(fixture.proposal().id().toString(), json.path("applicationEvidence").path("proposalId").asString());
        assertEquals("acceptance", tasks.find(f.task().id(), project, false).column());
        var noProcesses = org.mockito.Mockito.mock(com.lh.eap.api.ProcessExecutor.class);
        var reopened = applicationDeliveryService(f, noProcesses);
        assertEquals(delivery, reopened.get(f.task().id(), f.execution(), project).record());
        assertEquals(delivery, reopened.submit(f.task().id(), f.execution(), request));
        org.mockito.Mockito.verifyNoInteractions(noProcesses);
        var accept = new BoardDeliveryService.Decide(project, 2, UUID.randomUUID(), delivery.id(), "ACCEPT", true, true, "isolated fixture, not user acceptance");
        var decided = service.decide(f.task().id(), f.execution(), accept);
        assertEquals(json.path("applicationEvidence"), tools.jackson.databind.json.JsonMapper.builder().build().valueToTree(decided).path("applicationEvidence"));
        assertEquals(decided, reopened.decide(f.task().id(), f.execution(), accept));
        assertEquals("done", tasks.find(f.task().id(), project, false).column());
        org.mockito.Mockito.verifyNoInteractions(noProcesses);
    }
    @Test void linkedDeliveryDenialsAndTaskTransitionFailureLeaveNoPartialEvidence() throws Exception {
        var fixture = appliedDeliveryFixture(); var f = fixture.fixture(); var request = fixture.request();
        var service = applicationDeliveryService(f, executor);
        var foreign = new BoardDeliveryService.Request(project,1,request.workspacePath(),request.requestId(),request.paths(),request.note(),new BoardDeliveryService.ApplicationRef(UUID.randomUUID(),fixture.proposal().id()));
        assertEquals("BOARD_DELIVERY_APPLICATION_NOT_FOUND",rejects(() -> service.submit(f.task().id(),f.execution(),foreign)).getReason());
        assertNull(service.get(f.task().id(),f.execution(),project).record()); assertEquals(1,tasks.find(f.task().id(),project,false).revision());
        var failingTasks=org.mockito.Mockito.mock(BoardTaskService.class,org.mockito.AdditionalAnswers.delegatesTo(tasks));
        org.mockito.Mockito.doThrow(new IllegalStateException("test transition failure")).when(failingTasks).deliveryTransition(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.eq("acceptance"));
        var failed=new BoardDeliveryService(jdbc,failingTasks,executions,git,context.getBean(CapabilityRegistry.class),f.verification(),new BoardDeliveryCapture(executor,new BoardVerificationSource()),new BoardApplicationEvidence(codeStore(),new com.lh.eap.delivery.JdbcCodeGenerationStore(jdbc,context.getBean(PlatformTransactionManager.class))));
        assertThrows(IllegalStateException.class,() -> failed.submit(f.task().id(),f.execution(),request));
        assertNull(service.get(f.task().id(),f.execution(),project).record()); assertEquals("ready",tasks.find(f.task().id(),project,false).column());
        assertEquals("CHAT_APPLIED_POST_HOC",service.submit(f.task().id(),f.execution(),request).source());
    }
    @Test void acceptRechecksDurableResultWhileRejectPreservesOriginalEvidence() throws Exception {
        var fixture=appliedDeliveryFixture(); var f=fixture.fixture(); var service=applicationDeliveryService(f,executor);
        var delivery=service.submit(f.task().id(),f.execution(),fixture.request());
        jdbc.update("UPDATE eap.code_proposal SET result=jsonb_set(result,'{afterHash}',to_jsonb(?::text)) WHERE id=?", "f".repeat(64),fixture.proposal().id());
        var accept=new BoardDeliveryService.Decide(project,2,UUID.randomUUID(),delivery.id(),"ACCEPT",true,true,"isolated test");
        assertEquals("BOARD_DELIVERY_APPLICATION_SOURCE_MISMATCH",rejects(() -> service.decide(f.task().id(),f.execution(),accept)).getReason());
        assertEquals(delivery,service.get(f.task().id(),f.execution(),project).record()); assertEquals(2,tasks.find(f.task().id(),project,false).revision());
        var process=org.mockito.Mockito.mock(com.lh.eap.api.ProcessExecutor.class);
        var reject=new BoardDeliveryService.Decide(project,2,UUID.randomUUID(),delivery.id(),"REJECT",false,false,"isolated stale application fixture");
        var decided=applicationDeliveryService(f,process).decide(f.task().id(),f.execution(),reject);
        assertEquals(delivery.applicationEvidence(),decided.applicationEvidence()); assertEquals("ready",tasks.find(f.task().id(),project,false).column()); org.mockito.Mockito.verifyNoInteractions(process);
    }
    @Test void v15RequiresCompletePostHocEvidenceAndRetainsExternalManual() throws Exception {
        var fixture=appliedDeliveryFixture(); var f=fixture.fixture(); var service=applicationDeliveryService(f,executor);
        var delivery=service.submit(f.task().id(),f.execution(),fixture.request());
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        var original=json.valueToTree(delivery);
        for (String field:List.of("association","conversationId","proposalId","generationId","targetPath","generationBaseHash","appliedAfterHash","generationCapturedAt","prototypeVersionId","prototypeContentHash","associatedAt","operator")) {
            var invalid=original.deepCopy(); ((tools.jackson.databind.node.ObjectNode)invalid.get("applicationEvidence")).remove(field);
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=?::jsonb WHERE execution_id=?",json.writeValueAsString(invalid),f.execution()),field);
        }
        for (String expression:List.of("delivery_snapshot - 'applicationEvidence'", "jsonb_set(delivery_snapshot,'{applicationEvidence}','null'::jsonb)", "jsonb_set(delivery_snapshot,'{source}','\"EXTERNAL_MANUAL\"'::jsonb)", "jsonb_set(delivery_snapshot,'{applicationEvidence,appliedAfterHash}','\"fake\"'::jsonb)"))
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,() -> jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot="+expression+" WHERE execution_id=?",f.execution()));
        assertEquals(delivery,service.get(f.task().id(),f.execution(),project).record());
        // The historical manual shape, with no applicationEvidence key, remains valid.
        jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=jsonb_set(delivery_snapshot - 'applicationEvidence','{source}','\"EXTERNAL_MANUAL\"'::jsonb) WHERE execution_id=?",f.execution());
        assertEquals("EXTERNAL_MANUAL",service.get(f.task().id(),f.execution(),project).record().source());
    }
    private BoardDeliveryService applicationDeliveryService(DeliveryFixture f, com.lh.eap.api.ProcessExecutor process) throws Exception {
        return BoardDeliveryService.class.getConstructor(JdbcTemplate.class, BoardTaskService.class, MissionExecutionStore.class,
            MissionGitExecutionService.class, CapabilityRegistry.class, BoardVerificationService.class, BoardDeliveryCapture.class, BoardApplicationEvidence.class)
            .newInstance(jdbc, tasks, executions, git, context.getBean(CapabilityRegistry.class), f.verification(), new BoardDeliveryCapture(process, new BoardVerificationSource()),
                new BoardApplicationEvidence(codeStore(), new com.lh.eap.delivery.JdbcCodeGenerationStore(jdbc, context.getBean(PlatformTransactionManager.class))));
    }
    @AfterEach void cleanup() {
        executor.close();
        if (jdbc != null) {
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass('eap.code_proposal') IS NOT NULL", Boolean.class)))
                jdbc.update("DELETE FROM eap.code_proposal WHERE principal=?", project);
            jdbc.update("DELETE FROM eap.code_proposal WHERE workspace=?", repo.toAbsolutePath().toString());
            jdbc.update("DELETE FROM eap.code_generation WHERE workspace=?", repo.toAbsolutePath().toString());
            jdbc.update("DELETE FROM eap.code_generation WHERE principal=?", project);
            var missionIds = jdbc.queryForList("SELECT e.mission_id FROM eap.board_task_run r JOIN eap.board_task t ON t.id=r.task_id JOIN eap.mission_execution e ON e.id=r.execution_id WHERE t.project_id=?", UUID.class, project);
            jdbc.update("DELETE FROM eap.board_task_run WHERE task_id IN (SELECT id FROM eap.board_task WHERE project_id=?)", project);
            for (var id : missionIds) {
                var handoff = jdbc.queryForObject("SELECT handoff_id FROM eap.mission WHERE id=?", UUID.class, id);
                jdbc.update("DELETE FROM eap.mission_execution WHERE mission_id=?", id); jdbc.update("DELETE FROM eap.mission WHERE id=?", id); jdbc.update("DELETE FROM eap.handoff WHERE id=?", handoff);
            }
            jdbc.update("DELETE FROM eap.board_task WHERE project_id=?", project);
            for (var id : ownedVersions) jdbc.update("DELETE FROM eap.prototype_version WHERE id=?", id);
        }
        if (context != null) context.close();
    }
    @Configuration @EnableTransactionManagement(proxyTargetClass = true) static class Db {
        @Bean CapabilityRegistry registry() { return new CapabilityRegistry().register(new GitCapability("status")).register(new GitCapability("diff")); }
        @Bean CapabilityHandlerRegistry handlers(CapabilityRegistry registry, DefaultProcessExecutor executor) { return new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry, executor))); }
        @Bean CapabilitySettings settings(JdbcTemplate jdbc) { return new CapabilitySettings(jdbc, null); }
        @Bean MissionGitExecutionService git(MissionStore missions, MissionExecutionStore executions, CapabilityHandlerRegistry handlers, CapabilitySettings settings, CapabilityRegistry registry, DefaultProcessExecutor executor, RuntimeWorkspace workspace) { return new MissionGitExecutionService(missions, executions, handlers, settings, registry, executor, workspace); }
        @Bean GitReviewCapture capture(DefaultProcessExecutor executor) { return new GitReviewCapture(executor); }
        @Bean BoardReviewService reviews(JdbcTemplate jdbc, BoardTaskService tasks, MissionExecutionStore executions, MissionGitExecutionService git, CapabilityRegistry registry, CapabilityHandlerRegistry handlers, CapabilitySettings settings, GitReviewCapture capture) { return new BoardReviewService(jdbc, tasks, executions, git, registry, handlers, settings, capture); }
        @Bean JdbcTemplate jdbc(DataSource source) { return new JdbcTemplate(source); }
        @Bean PlatformTransactionManager manager(DataSource source) { return new DataSourceTransactionManager(source); }
        @Bean PrototypeVersionService versions(JdbcTemplate jdbc) { return new PrototypeVersionService(new JdbcPrototypeVersionStore(jdbc), new JdbcPrototypeDeliveryStore(jdbc)); }
        @Bean BoardPrototypeService prototypes(JdbcTemplate jdbc, BoardTaskService tasks, PrototypeVersionService versions) { return new BoardPrototypeService(jdbc, tasks, versions); }
        @Bean BoardTaskService tasks(JdbcTemplate jdbc) { return new BoardTaskService(jdbc); }
        @Bean HandoffStore handoffs(JdbcTemplate jdbc) { return new JdbcHandoffStore(jdbc); }
        @Bean MissionStore missions(JdbcTemplate jdbc) { return new JdbcMissionStore(jdbc); }
        @Bean MissionService missionService(HandoffStore handoffs, MissionStore missions) { return new MissionService(handoffs, missions); }
        @Bean MissionExecutionStore executions(JdbcTemplate jdbc) { return new JdbcMissionExecutionStore(jdbc); }
    }
}
