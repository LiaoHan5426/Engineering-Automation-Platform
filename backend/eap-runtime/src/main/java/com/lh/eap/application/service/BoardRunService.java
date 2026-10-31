package com.lh.eap.application.service;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Associates board snapshots with the existing Mission executor, without inventing completion. */
@Service
public class BoardRunService {
    public record Start(String projectId, long revision, UUID requestId, String workspacePath) {}
    public record Snapshot(String title, String goal, String acceptanceCriteria, BoardPrototypeService.Reference prototype) {}
    public record Run(UUID requestId, long taskRevision, Snapshot task, MissionExecution execution) {}
    public record Page(MissionGitExecutionService.Availability availability, List<Run> items) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final BoardTaskService tasks;
    private final BoardPrototypeService prototypes;
    private final HandoffStore handoffs;
    private final MissionService missions;
    private final MissionExecutionStore executions;
    private final MissionGitExecutionService git;
    private final TransactionTemplate transaction;
    private final Executor dispatcher;
    private final ExecutorService ownedDispatcher;

    @Autowired
    public BoardRunService(JdbcTemplate jdbc, BoardTaskService tasks, HandoffStore handoffs, MissionService missions,
                           MissionExecutionStore executions, MissionGitExecutionService git, PlatformTransactionManager manager, BoardPrototypeService prototypes) {
        this(jdbc, tasks, handoffs, missions, executions, git, manager, prototypes,
            new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(16),
                Thread.ofPlatform().daemon().name("board-git-", 0).factory(), new ThreadPoolExecutor.AbortPolicy()), true);
    }
    BoardRunService(JdbcTemplate jdbc, BoardTaskService tasks, HandoffStore handoffs, MissionService missions,
                    MissionExecutionStore executions, MissionGitExecutionService git, PlatformTransactionManager manager, BoardPrototypeService prototypes,
                    Executor dispatcher, boolean ownsDispatcher) {
        this.jdbc = jdbc; this.tasks = tasks; this.prototypes = prototypes; this.handoffs = handoffs; this.missions = missions;
        this.executions = executions; this.git = git; this.transaction = new TransactionTemplate(manager);
        this.dispatcher = dispatcher; this.ownedDispatcher = ownsDispatcher ? (ExecutorService) dispatcher : null;
    }
    @PreDestroy public void close() { if (ownedDispatcher != null) ownedDispatcher.shutdownNow(); }

    public Page list(UUID taskId, String projectId) {
        requireProject(projectId);
        tasks.find(taskId, projectId, false);
        return new Page(git.availability(), read("WHERE task_id=? ORDER BY created_at DESC, execution_id DESC LIMIT 30", taskId));
    }
    public Run start(UUID taskId, Start request) {
        requireProject(request.projectId());
        if (request.revision() < 1 || request.requestId() == null || request.workspacePath() == null || request.workspacePath().isBlank() || request.workspacePath().length() > 2048) {
            throw new IllegalArgumentException("INVALID_BOARD_RUN_REQUEST");
        }
        return transaction.execute(status -> {
            var task = tasks.find(taskId, request.projectId(), true);
            var prior = read("WHERE task_id=? AND request_id=?", taskId, request.requestId());
            if (!prior.isEmpty()) {
                var run = prior.getFirst();
                if (run.taskRevision() != request.revision() || !run.execution().workspacePath().equals(request.workspacePath())) throw conflict("BOARD_RUN_REQUEST_CONFLICT");
                return run;
            }
            if (task.revision() != request.revision()) throw conflict("BOARD_REVISION_CONFLICT");
            if (tasks.hasActiveExecution(taskId)) throw conflict("BOARD_EXECUTION_ACTIVE");
            if (!"ready".equals(task.column()) || !task.preparationIssues().isEmpty()) throw conflict("BOARD_PREPARATION_REQUIRED");
            var handoff = new Handoff(UUID.randomUUID(), "board", task.id().toString(), task.title(), "recorded", "not_started", "not_requested", "none", Instant.now());
            handoffs.insert(handoff);
            var mission = missions.create(handoff.id());
            // Authorization is rechecked here, and again in the worker before any process starts.
            var execution = git.reserve(mission.id(), UUID.randomUUID(), request.workspacePath());
            var snapshot = new Snapshot(task.title(), task.goal(), task.acceptanceCriteria(), prototypes.reference(task.prototypeVersionId()));
            jdbc.update("INSERT INTO eap.board_task_run(execution_id,task_id,request_id,task_revision,task_snapshot) VALUES (?,?,?,?,?::jsonb)",
                    execution.id(), taskId, request.requestId(), task.revision(), JSON.writeValueAsString(snapshot));
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { dispatch(execution); }
            });
            return new Run(request.requestId(), task.revision(), snapshot, execution);
        });
    }
    private void dispatch(MissionExecution execution) {
        try {
            dispatcher.execute(() -> {
                try { git.runReserved(execution.id()); }
                catch (RuntimeException failure) {
                    // Do not infer process termination when a persistence or worker failure is ambiguous.
                    try {
                        var saved = executions.find(execution.id()).orElseThrow();
                        if (Set.of("CREATED", "RUNNING", "CANCELLING").contains(saved.status())) executions.unconfirmed(execution.id(), "BOARD_RUN_RESULT_UNKNOWN");
                    } catch (RuntimeException ignored) { /* the persisted open row still prevents another start */ }
                }
            });
        } catch (RejectedExecutionException full) {
            var cleanup = new TransactionTemplate(transaction.getTransactionManager());
            cleanup.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            cleanup.executeWithoutResult(status -> executions.failSameRow(execution.id(), execution.missionId(), "BOARD_QUEUE_FULL"));
        }
    }
    private List<Run> read(String suffix, Object... parameters) {
        record Link(UUID requestId, long revision, Snapshot task, UUID executionId) {}
        var links = jdbc.query("SELECT * FROM eap.board_task_run " + suffix, (rs, row) ->
            new Link(rs.getObject("request_id", UUID.class), rs.getLong("task_revision"), JSON.readValue(rs.getString("task_snapshot"), Snapshot.class),
                rs.getObject("execution_id", UUID.class)), parameters);
        // Release the result set before reading execution records from the shared store.
        return links.stream().map(link -> new Run(link.requestId(), link.revision(), link.task(), executions.find(link.executionId()).orElseThrow())).toList();
    }
    private static void requireProject(String project) { if (project == null || project.isBlank() || project.length() > 120) throw new IllegalArgumentException("INVALID_BOARD_FIELD"); }
    private static ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
}
