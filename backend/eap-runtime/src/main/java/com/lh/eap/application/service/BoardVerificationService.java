package com.lh.eap.application.service;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import jakarta.annotation.PreDestroy;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static com.lh.eap.application.service.BoardVerificationSource.denied;

/** One immutable verification identity per Run; never advances Task or claims human acceptance. */
@Service
public class BoardVerificationService {
    public record Request(String projectId, String workspacePath) {}
    public record Start(String projectId, String workspacePath, String planHash) {}
    public record Check(String id, List<String> command, String workingDirectory, String status, Integer exitCode,
                        String stdout, String stderr, boolean truncated, boolean processTreeCleanup, Instant startedAt, Instant finishedAt) {}
    public record Record(UUID id, String status, String reason, BoardVerificationPlanSupport.Plan plan, List<Check> checks,
                         BoardVerificationSource.Source sourceAfter, Instant startedAt, Instant finishedAt, String workspacePath) {
        public Record(UUID id, String status, String reason, BoardVerificationPlanSupport.Plan plan, List<Check> checks,
                      BoardVerificationSource.Source sourceAfter, Instant startedAt, Instant finishedAt) {
            this(id, status, reason, plan, checks, sourceAfter, startedAt, finishedAt, plan == null ? null : plan.workspacePath());
        }
    }
    public record Page(Record record, boolean prepareAllowed, String reason) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final BoardTaskService tasks;
    private final MissionExecutionStore executions;
    private final MissionGitExecutionService git;
    private final CapabilityRegistry registry;
    private final CapabilitySettings settings;
    private final BoardVerificationPlanSupport plans;
    private final ProcessExecutor process;
    private final TransactionTemplate transaction;
    private final Executor dispatcher;
    private ExecutorService ownedDispatcher;
    @Autowired
    public BoardVerificationService(JdbcTemplate jdbc, BoardTaskService tasks, MissionExecutionStore executions, MissionGitExecutionService git,
                                    CapabilityRegistry registry, CapabilitySettings settings, BoardVerificationPlanSupport plans,
                                    @Qualifier("boardVerificationProcessExecutor") ProcessExecutor process, PlatformTransactionManager manager) {
        this(jdbc, tasks, executions, git, registry, settings, plans, process, manager,
            new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS, new ArrayBlockingQueue<>(16), Thread.ofPlatform().daemon().name("board-verify-", 0).factory(), new ThreadPoolExecutor.AbortPolicy()));
        ownedDispatcher = (ExecutorService) dispatcher;
    }
    BoardVerificationService(JdbcTemplate jdbc, BoardTaskService tasks, MissionExecutionStore executions, MissionGitExecutionService git,
                             CapabilityRegistry registry, CapabilitySettings settings, BoardVerificationPlanSupport plans,
                             ProcessExecutor process, PlatformTransactionManager manager, Executor dispatcher) {
        this.jdbc=jdbc; this.tasks=tasks; this.executions=executions; this.git=git; this.registry=registry; this.settings=settings;
        this.plans=plans; this.process=process; this.transaction=new TransactionTemplate(manager); this.transaction.setTimeout(90); this.dispatcher=dispatcher;
        // An enclosing failed HTTP request must not roll back an unconfirmed process identity.
        this.transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }
    @PreDestroy public void close() { if (ownedDispatcher != null) ownedDispatcher.shutdownNow(); }
    public Page get(UUID taskId, UUID executionId, String projectId) {
        requireProject(projectId); var task = tasks.find(taskId, projectId, false); var saved = read(taskId, executionId);
        if (saved != null) return new Page(saved, false, "BOARD_VERIFICATION_ALREADY_RECORDED");
        String reason = task.executionActive() ? "BOARD_EXECUTION_ACTIVE" : tasks.hasActiveWorkspace(executions.find(executionId).orElseThrow().workspacePath()) ? "BOARD_VERIFICATION_WORKSPACE_BUSY" : denial(executionId);
        return new Page(null, reason.isEmpty(), reason);
    }
    public BoardVerificationPlanSupport.Plan plan(UUID taskId, UUID executionId, Request request) {
        validate(request.projectId(), request.workspacePath());
        return observePreflight(taskId, executionId, request.workspacePath(), () -> {
            tasks.find(taskId, request.projectId(), true);
            var saved = read(taskId, executionId); requireWorkspace(executionId, request.workspacePath());
            if (saved != null) throw denied("BOARD_VERIFICATION_ALREADY_RECORDED");
            if (tasks.hasActiveExecution(taskId)) throw denied("BOARD_EXECUTION_ACTIVE");
            requireAllowed(executionId);
            tasks.lockWorkspace(request.workspacePath());
            if (tasks.hasActiveWorkspace(request.workspacePath())) throw denied("BOARD_VERIFICATION_WORKSPACE_BUSY");
            return plans.prepare(Path.of(request.workspacePath()), capability());
        });
    }
    public Record start(UUID taskId, UUID executionId, Start request) {
        validate(request.projectId(), request.workspacePath());
        if (request.planHash() == null || !request.planHash().matches("[a-f0-9]{64}")) throw new IllegalArgumentException("INVALID_BOARD_VERIFICATION_REQUEST");
        return observePreflight(taskId, executionId, request.workspacePath(), () -> {
            tasks.find(taskId, request.projectId(), true);
            var saved = read(taskId, executionId); requireWorkspace(executionId, request.workspacePath());
            if (saved != null) {
                if (saved.plan() == null) throw denied("BOARD_VERIFICATION_ALREADY_RECORDED");
                if (!saved.plan().planHash().equals(request.planHash()) || !saved.plan().workspacePath().equals(request.workspacePath())) throw denied("BOARD_VERIFICATION_REQUEST_CONFLICT");
                return saved;
            }
            if (tasks.hasActiveExecution(taskId)) throw denied("BOARD_EXECUTION_ACTIVE");
            requireAllowed(executionId);
            tasks.lockWorkspace(request.workspacePath());
            if (tasks.hasActiveWorkspace(request.workspacePath())) throw denied("BOARD_VERIFICATION_WORKSPACE_BUSY");
            var plan = plans.prepare(Path.of(request.workspacePath()), capability());
            if (!plan.planHash().equals(request.planHash())) throw denied("BOARD_VERIFICATION_PLAN_STALE");
            var queued = new Record(UUID.randomUUID(), "QUEUED", "", plan, List.of(), null, Instant.now(), null);
            if (jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot IS NULL", JSON.writeValueAsString(queued), taskId, executionId) != 1) throw denied("BOARD_VERIFICATION_REQUEST_CONFLICT");
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { dispatch(taskId, executionId); }
            });
            return queued;
        });
    }
    private record Observation<T>(T value, ResponseStatusException failure) {}
    private <T> T observePreflight(UUID taskId, UUID executionId, String workspace, Supplier<T> action) {
        var observed = transaction.execute(status -> {
            var started = Instant.now();
            try { return new Observation<>(action.get(), null); }
            catch (ResponseStatusException failure) {
                if (!"BOARD_VERIFICATION_PROCESS_UNKNOWN".equals(failure.getReason())) throw failure;
                // Keep the task/workspace locks until this identity commits. No plan was obtained.
                var unknown = new Record(UUID.randomUUID(), "UNKNOWN", failure.getReason(), null, List.of(), null, started, null, workspace);
                if (jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot IS NULL", JSON.writeValueAsString(unknown), taskId, executionId) != 1) throw denied("BOARD_VERIFICATION_REQUEST_CONFLICT");
                return new Observation<T>(null, failure);
            }
        });
        // Raise the HTTP error only after the independent transaction has committed the interlock.
        if (observed.failure() != null) throw observed.failure();
        return observed.value();
    }
    private void dispatch(UUID taskId, UUID executionId) {
        try { dispatcher.execute(() -> runReserved(taskId, executionId)); }
        catch (RejectedExecutionException full) { markUnknown(taskId, executionId, "BOARD_VERIFICATION_QUEUE_REJECTED"); }
    }
    void runReserved(UUID taskId, UUID executionId) {
        var queued = read(taskId, executionId);
        if (queued == null || !queued.status().equals("QUEUED")) return;
        var current = new Record(queued.id(), "RUNNING", "", queued.plan(), queued.checks(), null, queued.startedAt(), null);
        if (!save(taskId, executionId, current, "QUEUED")) return;
        boolean processUnconfirmed = false;
        try {
            requireAllowed(executionId);
            var before = plans.prepare(Path.of(current.plan().workspacePath()), capability());
            if (!before.planHash().equals(current.plan().planHash())) {
                save(taskId, executionId, finish(current, "STALE", "BOARD_VERIFICATION_PLAN_STALE", before.source()), "RUNNING"); return;
            }
            var checks = new ArrayList<Check>();
            for (var command : current.plan().commands()) {
                requireAllowed(executionId);
                if (!checks.isEmpty()) {
                    var between = plans.prepare(Path.of(current.plan().workspacePath()), capability());
                    if (!between.planHash().equals(current.plan().planHash())) {
                        save(taskId, executionId, finish(current, "STALE", "BOARD_VERIFICATION_SOURCE_CHANGED", between.source()), "RUNNING"); return;
                    }
                }
                var started = Instant.now();
                var pending = new Check(command.id(), command.command(), command.workingDirectory(), "RUNNING", null, "", "", false, false, started, null);
                checks.add(pending);
                current = new Record(current.id(), "RUNNING", "", current.plan(), List.copyOf(checks), null, current.startedAt(), null);
                if (!save(taskId, executionId, current, "RUNNING")) return;
                processUnconfirmed = true;
                var result = process.runIsolated("vp", Path.of(command.workingDirectory()), command.command(), BoardVerificationPlanSupport.environment());
                var metadata = new LinkedHashMap<String, Object>(result.metadata()); metadata.put("exitCode", result.exitCode());
                var outcome = MissionRunOutcome.from(String.valueOf(metadata.get("executorStatus")), metadata, false);
                boolean cleaned = outcome.terminal() && Boolean.TRUE.equals(metadata.get("processTreeCleanup"));
                processUnconfirmed = !cleaned;
                var status = !cleaned ? "UNKNOWN" : "TIMED_OUT".equals(outcome.status()) ? "TIMED_OUT" : "SUCCEEDED".equals(outcome.status()) && result.success() && result.exitCode() == 0 ? "PASSED" : "FAILED";
                var out = com.lh.eap.common.SensitiveData.redact(result.stdout()); var err = com.lh.eap.common.SensitiveData.redact(result.stderr());
                boolean truncated = Boolean.TRUE.equals(result.metadata().get("truncated")) || out.length() > 16384 || err.length() > 16384;
                checks.set(checks.size() - 1, new Check(command.id(), command.command(), command.workingDirectory(), status, result.exitCode(), clip(out), clip(err), truncated, cleaned, started, Instant.now()));
                current = new Record(current.id(), "RUNNING", "", current.plan(), List.copyOf(checks), null, current.startedAt(), null);
                if (!save(taskId, executionId, current, "RUNNING")) return;
                if (!cleaned) { save(taskId, executionId, finish(current, "UNKNOWN", "BOARD_VERIFICATION_PROCESS_UNKNOWN", null), "RUNNING"); return; }
                if (!status.equals("PASSED")) break;
            }
            var after = plans.prepare(Path.of(current.plan().workspacePath()), capability());
            boolean changed = !after.planHash().equals(current.plan().planHash());
            boolean passed = current.checks().size() == current.plan().commands().size() && current.checks().stream().allMatch(check -> check.status().equals("PASSED"));
            save(taskId, executionId, finish(current, changed ? "STALE" : passed ? "PASSED" : "FAILED", changed ? "BOARD_VERIFICATION_SOURCE_CHANGED" : passed ? "" : "BOARD_VERIFICATION_CHECK_FAILED", after.source()), "RUNNING");
        } catch (RuntimeException failure) {
            // A known preflight denial is not an orphan process. Unexpected failures remain conservative.
            String reason = failure instanceof ResponseStatusException denied && denied.getReason() != null
                && denied.getReason().matches("[A-Z_]{1,100}") ? denied.getReason() : "BOARD_VERIFICATION_RESULT_UNKNOWN";
            boolean knownDenial = failure instanceof ResponseStatusException && !processUnconfirmed
                && !reason.equals("BOARD_VERIFICATION_PROCESS_UNKNOWN") && !reason.equals("BOARD_VERIFICATION_RESULT_UNKNOWN");
            try { save(taskId, executionId, finish(current, knownDenial ? "FAILED" : "UNKNOWN", reason, current.sourceAfter()), "RUNNING"); }
            catch (RuntimeException ignored) { /* durable RUNNING still blocks reuse */ }
        }
    }
    private boolean save(UUID taskId, UUID executionId, Record record, String expected) {
        if (!Set.of("QUEUED", "RUNNING").contains(expected)) throw new IllegalArgumentException("Invalid verification transition");
        return jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status'='" + expected + "'", JSON.writeValueAsString(record), taskId, executionId) == 1;
    }
    private static Record finish(Record current, String status, String reason, BoardVerificationSource.Source after) {
        return new Record(current.id(), status, reason, current.plan(), current.checks(), after, current.startedAt(), status.equals("UNKNOWN") ? null : Instant.now());
    }
    private static String clip(String value) { return value.length() <= 16384 ? value : value.substring(0, 16384); }
    private void markUnknown(UUID taskId, UUID executionId, String reason) {
        jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(verification_snapshot,'{status}','\"UNKNOWN\"'::jsonb),'{reason}',to_jsonb(?::text)) WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status' IN ('QUEUED','RUNNING')", reason, taskId, executionId);
    }
    public void markRestartUnknown() {
        jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(verification_snapshot,'{status}','\"UNKNOWN\"'::jsonb),'{reason}','\"BOARD_VERIFICATION_RESTART_UNKNOWN\"'::jsonb) WHERE verification_snapshot->>'status' IN ('QUEUED','RUNNING')");
    }
    private Record read(UUID taskId, UUID executionId) {
        var rows = jdbc.query("SELECT verification_snapshot FROM eap.board_task_run WHERE task_id=? AND execution_id=?", (rs, row) -> {
            var text = rs.getString(1); return text == null ? Optional.<Record>empty() : Optional.of(JSON.readValue(text, Record.class));
        }, taskId, executionId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "BOARD_RUN_NOT_FOUND");
        return rows.getFirst().orElse(null);
    }
    private void requireWorkspace(UUID id, String workspace) { if (!workspace.equals(executions.find(id).orElseThrow().workspacePath())) throw denied("BOARD_WORKSPACE_CHANGED"); }
    private void requireAllowed(UUID id) { var reason = denial(id); if (!reason.isEmpty()) throw denied(reason); }
    private String denial(UUID id) {
        var run = executions.find(id).orElseThrow();
        if (!"SUCCEEDED".equals(run.status()) || run.unconfirmedReason() != null) return "BOARD_VERIFICATION_RUN_NOT_SUCCEEDED";
        var available = git.availability(); if (!available.allowed()) return available.reason();
        if (!available.workspacePath().equals(run.workspacePath()) || capability() == null || !capability().executable().equals(run.executable())) return "BOARD_WORKSPACE_CHANGED";
        if (!settings.enabled("vp")) return "CAPABILITY_DISABLED";
        return plans.availability();
    }
    private GitCapability capability() { return registry.all().stream().filter(item -> item.name().equals("git-status") && item instanceof GitCapability).map(item -> (GitCapability)item).findFirst().orElse(null); }
    private static void validate(String projectId, String workspace) { requireProject(projectId); if (workspace == null || workspace.isBlank() || workspace.length() > 2048) throw new IllegalArgumentException("INVALID_BOARD_VERIFICATION_REQUEST"); }
    private static void requireProject(String id) { if (id == null || id.isBlank() || id.length() > 120) throw new IllegalArgumentException("INVALID_BOARD_FIELD"); }
}
