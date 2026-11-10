package com.lh.eap.application.service;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.persistence.mapper.StateBindings;
import com.lh.eap.error.BoardErrors;
import com.lh.eap.error.BoardVerificationErrors;
import com.lh.eap.error.ToolErrors;

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
                        String stdout, String stderr, boolean truncated, boolean processTreeCleanup, Instant startedAt, Instant finishedAt) {
        public Check { BoardVerificationCheckStatus.fromWire(status); }
    }
    public record Record(UUID id, String status, String reason, BoardVerificationPlanSupport.Plan plan, List<Check> checks,
                         BoardVerificationSource.Source sourceAfter, Instant startedAt, Instant finishedAt, String workspacePath) {
        public Record { BoardVerificationStatus.fromWire(status); }
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
        if (saved != null) return new Page(saved, false, BoardVerificationErrors.BOARD_VERIFICATION_ALREADY_RECORDED.code());
        String reason = task.executionActive() ? BoardErrors.BOARD_EXECUTION_ACTIVE.code() : tasks.hasActiveWorkspace(executions.find(executionId).orElseThrow().workspacePath()) ? BoardVerificationErrors.BOARD_VERIFICATION_WORKSPACE_BUSY.code() : denial(executionId);
        return new Page(null, reason.isEmpty(), reason);
    }
    public BoardVerificationPlanSupport.Plan plan(UUID taskId, UUID executionId, Request request) {
        validate(request.projectId(), request.workspacePath());
        return observePreflight(taskId, executionId, request.workspacePath(), () -> {
            tasks.find(taskId, request.projectId(), true);
            var saved = read(taskId, executionId); requireWorkspace(executionId, request.workspacePath());
            if (saved != null) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_ALREADY_RECORDED.code());
            if (tasks.hasActiveExecution(taskId)) throw denied(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
            requireAllowed(executionId);
            tasks.lockWorkspace(request.workspacePath());
            if (tasks.hasActiveWorkspace(request.workspacePath())) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_WORKSPACE_BUSY.code());
            return plans.prepare(Path.of(request.workspacePath()), capability());
        });
    }
    public Record start(UUID taskId, UUID executionId, Start request) {
        validate(request.projectId(), request.workspacePath());
        if (request.planHash() == null || !request.planHash().matches("[a-f0-9]{64}")) throw new IllegalArgumentException(BoardVerificationErrors.INVALID_BOARD_VERIFICATION_REQUEST.code());
        return observePreflight(taskId, executionId, request.workspacePath(), () -> {
            tasks.find(taskId, request.projectId(), true);
            var saved = read(taskId, executionId); requireWorkspace(executionId, request.workspacePath());
            if (saved != null) {
                if (saved.plan() == null) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_ALREADY_RECORDED.code());
                if (!saved.plan().planHash().equals(request.planHash()) || !saved.plan().workspacePath().equals(request.workspacePath())) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_REQUEST_CONFLICT.code());
                return saved;
            }
            if (tasks.hasActiveExecution(taskId)) throw denied(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
            requireAllowed(executionId);
            tasks.lockWorkspace(request.workspacePath());
            if (tasks.hasActiveWorkspace(request.workspacePath())) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_WORKSPACE_BUSY.code());
            var plan = plans.prepare(Path.of(request.workspacePath()), capability());
            if (!plan.planHash().equals(request.planHash())) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_PLAN_STALE.code());
            var queued = new Record(UUID.randomUUID(), BoardVerificationStatus.QUEUED.wire(), "", plan, List.of(), null, Instant.now(), null);
            if (jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot IS NULL", JSON.writeValueAsString(queued), taskId, executionId) != 1) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_REQUEST_CONFLICT.code());
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { dispatch(taskId, executionId); }
            });
            return queued;
        });
    }
    private record Observation<T>(T value, ResponseStatusException failure) {}
    <T> T observePreflight(UUID taskId, UUID executionId, String workspace, Supplier<T> action) {
        var observed = transaction.execute(status -> {
            var started = Instant.now();
            try { return new Observation<>(action.get(), null); }
            catch (ResponseStatusException failure) {
                if (!BoardVerificationErrors.BOARD_VERIFICATION_PROCESS_UNKNOWN.code().equals(failure.getReason())) throw failure;
                // Keep the task/workspace locks until this identity commits. No plan was obtained.
                var unknown = new Record(UUID.randomUUID(), BoardVerificationStatus.UNKNOWN.wire(), failure.getReason(), null, List.of(), null, started, null, workspace);
                if (jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot IS NULL", JSON.writeValueAsString(unknown), taskId, executionId) != 1) {
                    // Delivery reuses a completed verification's identity/interlock, retaining all
                    // original plan/check evidence. A new unconfirmed read invalidates eligibility.
                    if (jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(jsonb_set(verification_snapshot,'{status}','\"UNKNOWN\"'::jsonb),'{reason}','\"BOARD_DELIVERY_PROCESS_UNKNOWN\"'::jsonb),'{finishedAt}','null'::jsonb) WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status'='PASSED'", taskId, executionId) != 1) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_REQUEST_CONFLICT.code());
                }
                return new Observation<T>(null, failure);
            }
        });
        // Raise the HTTP error only after the independent transaction has committed the interlock.
        if (observed.failure() != null) throw observed.failure();
        return observed.value();
    }
    private void dispatch(UUID taskId, UUID executionId) {
        try { dispatcher.execute(() -> runReserved(taskId, executionId)); }
        catch (RejectedExecutionException full) { markUnknown(taskId, executionId, BoardVerificationErrors.BOARD_VERIFICATION_QUEUE_REJECTED.code()); }
    }
    void runReserved(UUID taskId, UUID executionId) {
        var queued = read(taskId, executionId);
        if (queued == null || !queued.status().equals(BoardVerificationStatus.QUEUED.wire())) return;
        var current = new Record(queued.id(), BoardVerificationStatus.RUNNING.wire(), "", queued.plan(), queued.checks(), null, queued.startedAt(), null);
        if (!save(taskId, executionId, current, BoardVerificationStatus.QUEUED.wire())) return;
        boolean processUnconfirmed = false;
        try {
            requireAllowed(executionId);
            var before = plans.prepare(Path.of(current.plan().workspacePath()), capability());
            if (!before.planHash().equals(current.plan().planHash())) {
                save(taskId, executionId, finish(current, BoardVerificationStatus.STALE.wire(), BoardVerificationErrors.BOARD_VERIFICATION_PLAN_STALE.code(), before.source()), BoardVerificationStatus.RUNNING.wire()); return;
            }
            var checks = new ArrayList<Check>();
            for (var command : current.plan().commands()) {
                requireAllowed(executionId);
                if (!checks.isEmpty()) {
                    var between = plans.prepare(Path.of(current.plan().workspacePath()), capability());
                    if (!between.planHash().equals(current.plan().planHash())) {
                        save(taskId, executionId, finish(current, BoardVerificationStatus.STALE.wire(), BoardVerificationErrors.BOARD_VERIFICATION_SOURCE_CHANGED.code(), between.source()), BoardVerificationStatus.RUNNING.wire()); return;
                    }
                }
                var started = Instant.now();
                var pending = new Check(command.id(), command.command(), command.workingDirectory(), BoardVerificationCheckStatus.RUNNING.wire(), null, "", "", false, false, started, null);
                checks.add(pending);
                current = new Record(current.id(), BoardVerificationStatus.RUNNING.wire(), "", current.plan(), List.copyOf(checks), null, current.startedAt(), null);
                if (!save(taskId, executionId, current, BoardVerificationStatus.RUNNING.wire())) return;
                processUnconfirmed = true;
                var result = process.runIsolated("vp", Path.of(command.workingDirectory()), command.command(), BoardVerificationPlanSupport.environment());
                var metadata = new LinkedHashMap<String, Object>(result.metadata()); metadata.put("exitCode", result.exitCode());
                var outcome = MissionRunOutcome.from(String.valueOf(metadata.get("executorStatus")), metadata, false);
                boolean cleaned = outcome.terminal() && Boolean.TRUE.equals(metadata.get("processTreeCleanup"));
                processUnconfirmed = !cleaned;
                var status = !cleaned ? BoardVerificationCheckStatus.UNKNOWN.wire() : MissionExecutionStatus.TIMED_OUT.wire().equals(outcome.status()) ? BoardVerificationCheckStatus.TIMED_OUT.wire() : MissionExecutionStatus.SUCCEEDED.wire().equals(outcome.status()) && result.success() && result.exitCode() == 0 ? BoardVerificationCheckStatus.PASSED.wire() : BoardVerificationCheckStatus.FAILED.wire();
                var out = SensitiveData.redact(result.stdout()); var err = SensitiveData.redact(result.stderr());
                boolean truncated = Boolean.TRUE.equals(result.metadata().get("truncated")) || out.length() > 16384 || err.length() > 16384;
                checks.set(checks.size() - 1, new Check(command.id(), command.command(), command.workingDirectory(), status, result.exitCode(), clip(out), clip(err), truncated, cleaned, started, Instant.now()));
                current = new Record(current.id(), BoardVerificationStatus.RUNNING.wire(), "", current.plan(), List.copyOf(checks), null, current.startedAt(), null);
                if (!save(taskId, executionId, current, BoardVerificationStatus.RUNNING.wire())) return;
                if (!cleaned) { save(taskId, executionId, finish(current, BoardVerificationStatus.UNKNOWN.wire(), BoardVerificationErrors.BOARD_VERIFICATION_PROCESS_UNKNOWN.code(), null), BoardVerificationStatus.RUNNING.wire()); return; }
                if (!status.equals(BoardVerificationCheckStatus.PASSED.wire())) break;
            }
            var after = plans.prepare(Path.of(current.plan().workspacePath()), capability());
            boolean changed = !after.planHash().equals(current.plan().planHash());
            boolean passed = current.checks().size() == current.plan().commands().size() && current.checks().stream().allMatch(check -> check.status().equals(BoardVerificationCheckStatus.PASSED.wire()));
            save(taskId, executionId, finish(current, changed ? BoardVerificationStatus.STALE.wire() : passed ? BoardVerificationStatus.PASSED.wire() : BoardVerificationStatus.FAILED.wire(), changed ? BoardVerificationErrors.BOARD_VERIFICATION_SOURCE_CHANGED.code() : passed ? "" : BoardVerificationErrors.BOARD_VERIFICATION_CHECK_FAILED.code(), after.source()), BoardVerificationStatus.RUNNING.wire());
        } catch (RuntimeException failure) {
            // A known preflight denial is not an orphan process. Unexpected failures remain conservative.
            String reason = failure instanceof ResponseStatusException denied && denied.getReason() != null
                && denied.getReason().matches("[A-Z_]{1,100}") ? denied.getReason() : BoardVerificationErrors.BOARD_VERIFICATION_RESULT_UNKNOWN.code();
            boolean knownDenial = failure instanceof ResponseStatusException && !processUnconfirmed
                && !reason.equals(BoardVerificationErrors.BOARD_VERIFICATION_PROCESS_UNKNOWN.code()) && !reason.equals(BoardVerificationErrors.BOARD_VERIFICATION_RESULT_UNKNOWN.code());
            try { save(taskId, executionId, finish(current, knownDenial ? BoardVerificationStatus.FAILED.wire() : BoardVerificationStatus.UNKNOWN.wire(), reason, current.sourceAfter()), BoardVerificationStatus.RUNNING.wire()); }
            catch (RuntimeException ignored) { /* durable RUNNING still blocks reuse */ }
        }
    }
    private boolean save(UUID taskId, UUID executionId, Record record, String expected) {
        if (!Set.of(BoardVerificationStatus.QUEUED.wire(), BoardVerificationStatus.RUNNING.wire()).contains(expected)) throw new IllegalArgumentException("Invalid verification transition");
        return jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status'=?", JSON.writeValueAsString(record), taskId, executionId, expected) == 1;
    }
    private static Record finish(Record current, String status, String reason, BoardVerificationSource.Source after) {
        return new Record(current.id(), status, reason, current.plan(), current.checks(), after, current.startedAt(), status.equals(BoardVerificationStatus.UNKNOWN.wire()) ? null : Instant.now());
    }
    private static String clip(String value) { return value.length() <= 16384 ? value : value.substring(0, 16384); }
    private void markUnknown(UUID taskId, UUID executionId, String reason) {
        jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(verification_snapshot,'{status}',to_jsonb(?::text)),'{reason}',to_jsonb(?::text)) WHERE task_id=? AND execution_id=? AND verification_snapshot->>'status' = ANY(?::text[])",
                BoardVerificationStatus.UNKNOWN.wire(), reason, taskId, executionId, StateBindings.VERIFICATION_ACTIVE);
    }
    public void markRestartUnknown() {
        jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=jsonb_set(jsonb_set(verification_snapshot,'{status}',to_jsonb(?::text)),'{reason}',to_jsonb(?::text)) WHERE verification_snapshot->>'status' = ANY(?::text[])",
                BoardVerificationStatus.UNKNOWN.wire(), BoardVerificationErrors.BOARD_VERIFICATION_RESTART_UNKNOWN.code(), StateBindings.VERIFICATION_ACTIVE);
    }
    private Record read(UUID taskId, UUID executionId) {
        var rows = jdbc.query("SELECT verification_snapshot FROM eap.board_task_run WHERE task_id=? AND execution_id=?", (rs, row) -> {
            var text = rs.getString(1); return text == null ? Optional.<Record>empty() : Optional.of(JSON.readValue(text, Record.class));
        }, taskId, executionId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, BoardErrors.BOARD_RUN_NOT_FOUND.code());
        return rows.getFirst().orElse(null);
    }
    private void requireWorkspace(UUID id, String workspace) { if (!workspace.equals(executions.find(id).orElseThrow().workspacePath())) throw denied(BoardErrors.BOARD_WORKSPACE_CHANGED.code()); }
    private void requireAllowed(UUID id) { var reason = denial(id); if (!reason.isEmpty()) throw denied(reason); }
    private String denial(UUID id) {
        var run = executions.find(id).orElseThrow();
        if (!MissionExecutionStatus.SUCCEEDED.wire().equals(run.status()) || run.unconfirmedReason() != null) return BoardVerificationErrors.BOARD_VERIFICATION_RUN_NOT_SUCCEEDED.code();
        var available = git.availability(); if (!available.allowed()) return available.reason();
        if (!available.workspacePath().equals(run.workspacePath()) || capability() == null || !capability().executable().equals(run.executable())) return BoardErrors.BOARD_WORKSPACE_CHANGED.code();
        if (!settings.enabled("vp")) return ToolErrors.CAPABILITY_DISABLED.code();
        return plans.availability();
    }
    private GitCapability capability() { return registry.all().stream().filter(item -> item.name().equals("git-status") && item instanceof GitCapability).map(item -> (GitCapability)item).findFirst().orElse(null); }
    private static void validate(String projectId, String workspace) { requireProject(projectId); if (workspace == null || workspace.isBlank() || workspace.length() > 2048) throw new IllegalArgumentException(BoardVerificationErrors.INVALID_BOARD_VERIFICATION_REQUEST.code()); }
    private static void requireProject(String id) { if (id == null || id.isBlank() || id.length() > 120) throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_FIELD.code()); }
}
