package com.lh.eap.application.service;
import java.math.BigDecimal;
import java.util.function.UnaryOperator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.transaction.TransactionException;
import com.lh.eap.error.CliProgramErrors;
import com.lh.eap.error.ProtocolErrors;
import com.lh.eap.error.WorkspaceErrors;
import com.lh.eap.error.GitErrors;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.CommonErrors;
import com.lh.eap.error.ToolErrors;

import com.lh.eap.api.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.LocalBinaries;
import com.lh.eap.local.LocalProcessIdentityInspector;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Durable manual execution of the two built-in, read-only Git operations. */
@Service
public class ToolExecutionService implements InitializingBean {
    private static final Logger LOG = LoggerFactory.getLogger(ToolExecutionService.class);
    private final ToolExecutionStore store;
    private final RuntimeWorkspace runtime;
    private final CapabilitySettings settings;
    private final CapabilityHandlerRegistry handlers;
    private final CapabilityRegistry capabilities;
    private final ProcessExecutor executor;
    private final ExecutorService workers = Executors.newVirtualThreadPerTaskExecutor();
    private final Semaphore capacity = new Semaphore(16);
    private final ConcurrentHashMap<UUID, AtomicBoolean> active = new ConcurrentHashMap<>();

    public ToolExecutionService(ToolExecutionStore store, RuntimeWorkspace runtime, CapabilitySettings settings,
            CapabilityHandlerRegistry handlers, CapabilityRegistry capabilities, ProcessExecutor executor) {
        this.store = store; this.runtime = runtime; this.settings = settings;
        this.handlers = handlers; this.capabilities = capabilities; this.executor = executor;
    }
    @Override public void afterPropertiesSet() { store.markRestartUnknown(); }

    public ToolExecution start(UUID requestId) { return start("git-status", requestId); }
    public ToolExecution start(String operation, UUID requestId) {
        validateOperation(operation);
        if (requestId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, CommonErrors.REQUEST_ID_REQUIRED.code());
        var workspace = workspace();
        var prior = store.request(workspace.toString(), requestId);
        if (prior.isPresent()) return sameOperation(prior.get(), operation);
        var blocking = store.blocking(workspace.toString(), operation);
        if (blocking.isPresent()) throw new Blocked(blocking.get());
        var binary = authorize(workspace, operation);
        if (!capacity.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, ToolErrors.TOOL_EXECUTION_CAPACITY.code());
        var id = UUID.randomUUID();
        var token = new AtomicBoolean();
        var row = new ToolExecution(id, requestId, "git", operation, workspace.toString(), binary,
                ToolExecutionStatus.CREATED.wire(), false, Instant.now(), null, null, "", "", false, null, null, List.of());
        active.put(id, token);
        try {
            store.insert(row); // Must commit before submitting work. No request transaction spans execution.
        } catch (RuntimeException failure) {
            active.remove(id); capacity.release();
            if (failure instanceof DuplicateKeyException) {
                prior = store.request(workspace.toString(), requestId);
                if (prior.isPresent()) return sameOperation(prior.get(), operation);
                blocking = store.blocking(workspace.toString(), operation);
                if (blocking.isPresent()) throw new Blocked(blocking.get());
            }
            throw failure;
        }
        try { workers.submit(() -> execute(row, token)); }
        catch (RejectedExecutionException rejected) {
            active.remove(id); capacity.release();
            persist(id, current -> current.state(current.cancelRequested() ? ToolExecutionStatus.CANCELLED.wire() : ToolExecutionStatus.FAILED.wire(), current.cancelRequested(), Instant.now(), null,
                    "", ExecutionErrors.WORKER_UNAVAILABLE.code(), false, "PROCESS_NOT_STARTED", null, current.steps()));
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, ExecutionErrors.WORKER_UNAVAILABLE.code());
        }
        return row;
    }

    public List<ToolExecution> list(int limit) { return list("git-status", limit); }
    public ToolExecutionReadiness readiness(String operation) {
        validateOperation(operation);
        boolean scopeAccessible = false;
        try {
            var root = workspace();
            scopeAccessible = true;
            authorize(root, operation);
            var blocking = store.blocking(root.toString(), operation);
            return new ToolExecutionReadiness(operation, true, true, blocking.isEmpty(),
                    blocking.isPresent() ? ToolErrors.TOOL_EXECUTION_BLOCKED.code() : "READY",
                    blocking.map(ToolExecution::id).orElse(null), blocking.map(ToolExecution::status).orElse(null), Instant.now());
        } catch (ResponseStatusException denied) {
            return new ToolExecutionReadiness(operation, scopeAccessible, false, false,
                    denied.getReason(), null, null, Instant.now());
        }
    }
    public List<ToolExecution> list(String operation, int limit) {
        validateOperation(operation);
        if (limit < 1 || limit > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ProtocolErrors.INVALID_LIMIT.code());
        return store.list(workspace().toString(), operation, limit).stream().map(this::confirmOwnership).toList();
    }
    public ToolExecution get(UUID id) { return get("git-status", id); }
    public ToolExecution get(String operation, UUID id) { return confirmOwnership(require(operation, id)); }
    public ToolExecution cancel(UUID id) { return cancel("git-status", id); }
    public ToolExecution cancel(String operation, UUID id) {
        require(operation, id);
        var row = persist(id, current -> current.active()
                ? current.state(ToolExecutionStatus.CANCELLING.wire(), true, null, current.exitCode(), current.stdout(), current.stderr(),
                        current.truncated(), current.exitEvidence(), current.unconfirmedReason(), current.steps()) : current);
        if (row.active()) {
            var token = active.get(id);
            if (token != null) token.set(true);
        }
        return confirmOwnership(row);
    }
    public ToolProcessReview inspectProcesses(String operation, UUID id) {
        var row = require(operation, id);
        if (!List.of(ToolExecutionStatus.UNKNOWN.wire(), ToolExecutionStatus.CLOSED_UNKNOWN.wire()).contains(row.status()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, ExecutionErrors.PROCESS_REVIEW_NOT_UNKNOWN.code());
        var inspector = new LocalProcessIdentityInspector();
        var observations = row.steps().stream().limit(8).map(step -> {
            var evidence = step.evidence();
            boolean captured = evidence.get("processDescendants") instanceof List<?>;
            var children = captured ? (List<?>) evidence.get("processDescendants") : List.of();
            var descendants = children.stream().limit(32)
                    .map(value -> inspectIdentity(inspector, value instanceof Map<?, ?> map ? map : Map.of())).toList();
            return new ToolProcessReview.Step(step.id(), step.phase(), inspectIdentity(inspector, evidence), captured,
                    Boolean.TRUE.equals(evidence.get("processDescendantsTruncated")) || children.size() > 32, descendants);
        }).toList();
        return new ToolProcessReview(row.id(), operation, row.status(), Instant.now(), false,
                row.steps().size() > 8, observations);
    }
    private static ProcessIdentityInspection inspectIdentity(LocalProcessIdentityInspector inspector, Map<?, ?> evidence) {
        Long pid = null;
        if (evidence.get("processPid") instanceof Number value) {
            try { pid = new BigDecimal(value.toString()).longValueExact(); }
            catch (ArithmeticException | NumberFormatException invalid) { /* No usable captured PID. */ }
        }
        var started = evidence.get("processStartedAt") instanceof String value ? value : null;
        var executable = evidence.get("processExecutable") instanceof String value ? value : null;
        return inspector.inspect(pid, started, executable);
    }
    /**
     * Explicit local-operator attestation releases only this operation's reservation.
     * No process lookup/kill, execution replay or invented terminal result occurs here.
     */
    public ToolExecution resolveUnknown(String operation, UUID id, UUID requestId, String note, boolean processTreeStopped) {
        require(operation, id);
        if (requestId == null || note == null || note.strip().length() < 10 || note.length() > 2000 || !processTreeStopped)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ExecutionErrors.UNKNOWN_REVIEW_REQUIRED.code());
        var normalized = note.strip();
        var digest = reviewDigest(normalized);
        var redacted = SensitiveData.redact(normalized);
        var savedNote = redacted.substring(0, Math.min(2000, redacted.length()));
        return persist(id, row -> {
            // Check the live owner while holding the same short lock used by all transitions.
            if (active.containsKey(id))
                throw new ResponseStatusException(HttpStatus.CONFLICT, ExecutionErrors.EXECUTION_OWNER_STILL_ACTIVE.code());
            if (row.resolution() != null) {
                var prior = row.resolution();
                if (prior.requestId().equals(requestId) && prior.requestDigest().equals(digest))
                    return row;
                throw new ResponseStatusException(HttpStatus.CONFLICT, ExecutionErrors.UNKNOWN_REVIEW_CONFLICT.code());
            }
            if (!ToolExecutionStatus.UNKNOWN.wire().equals(row.status()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, ExecutionErrors.EXECUTION_NOT_UNKNOWN.code());
            return row.closeUnknown(new ToolExecution.Resolution(requestId, savedNote, digest,
                    "local-operator", Instant.now(), true));
        });
    }
    private static String reviewDigest(String note) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(note.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private ToolExecution require(String operation, UUID id) {
        validateOperation(operation);
        var root = workspace().toString();
        return store.find(id).filter(row -> row.workspacePath().equals(root) && row.capabilityId().equals(operation))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, ToolErrors.TOOL_EXECUTION_NOT_FOUND.code()));
    }
    private ToolExecution confirmOwnership(ToolExecution row) {
        if (row.active() && !active.containsKey(row.id())) return unknown(row.id(), ExecutionErrors.EXECUTION_OWNER_UNAVAILABLE.code());
        return row;
    }

    private void execute(ToolExecution row, AtomicBoolean cancelled) {
        try {
            // Revalidate at dispatch; never silently select a new executable or workspace.
            if (!authorize(Path.of(row.workspacePath()), row.capabilityId()).equals(row.executable())) {
                reject(row.id(), ToolErrors.TOOL_BINDING_CHANGED.code()); return;
            }
            var current = persist(row.id(), value -> value.active()
                    ? value.state(value.cancelRequested() ? ToolExecutionStatus.CANCELLING.wire() : ToolExecutionStatus.RUNNING.wire(), value.cancelRequested(),
                            null, null, "", "", false, null, null, value.steps()) : value);
            if (!current.active()) return;
            if (current.cancelRequested()) cancelled.set(true);
            var observed = new ArrayList<ToolExecution.Step>();
            ProcessExecutor tracked = new ProcessExecutor() {
                @Override public Observation run(String capability, Path directory, List<String> command) {
                    throw new UnsupportedOperationException("Isolated environment required");
                }
                @Override public Observation runIsolated(String capability, Path directory, List<String> command,
                                                         Map<String, String> environment) {
                    // An earlier Git phase cannot authorize a later process after a binding/grant changed.
                    if (!authorize(Path.of(row.workspacePath()), row.capabilityId()).equals(row.executable()))
                        throw new ResponseStatusException(HttpStatus.CONFLICT, ToolErrors.TOOL_BINDING_CHANGED.code());
                    var child = UUID.randomUUID();
                    var phase = switch (observed.size()) { case 0 -> "root"; case 1 -> "filters"; default -> row.capabilityId().substring(4); };
                    var pending = new ToolExecution.Step(child, phase, ToolExecutionStatus.CREATED.wire(), command, Map.of());
                    observed.add(pending);
                    saveSteps(row.id(), observed);
                    var result = executor.runManaged(child, capability, directory, command, environment, new ManagedProcessControl() {
                        public boolean cancellationRequested() { return cancelled.get(); }
                        public void started(Map<String, Object> identity) {
                            observed.set(observed.size() - 1, new ToolExecution.Step(child, phase, ToolExecutionStatus.RUNNING.wire(), command, identity));
                            saveSteps(row.id(), observed);
                        }
                        public void descendantsObserved(Map<String, Object> evidence) {
                            var previous = observed.getLast();
                            var facts = new LinkedHashMap<>(previous.evidence());
                            facts.putAll(evidence);
                            observed.set(observed.size() - 1, new ToolExecution.Step(child, phase, ToolExecutionStatus.RUNNING.wire(), command, facts));
                            saveSteps(row.id(), observed);
                        }
                    });
                    var facts = new LinkedHashMap<>(observed.getLast().evidence());
                    facts.putAll(result.metadata());
                    facts.remove("trace"); facts.remove("command");
                    facts.put("exitCode", result.exitCode());
                    observed.set(observed.size() - 1, new ToolExecution.Step(child, phase,
                            String.valueOf(facts.getOrDefault("executorStatus", ToolExecutionStatus.UNKNOWN.wire())), command, facts));
                    saveSteps(row.id(), observed);
                    return result;
                }
            };
            // Reuse all three safe command constructors, repository checks and filter disabling.
            var git = new GitCapability(row.capabilityId().substring(4), () -> row.executable());
            var result = git.execute(new ExecutionContext(Path.of(row.workspacePath()), tracked));
            var facts = new LinkedHashMap<>(result.metadata());
            facts.put("exitCode", result.exitCode());
            var outcome = MissionRunOutcome.from(String.valueOf(facts.get("executorStatus")), facts, cancelled.get());
            if (!outcome.terminal()) { unknown(row.id(), outcome.unconfirmedReason()); return; }
            var terminal = outcome.status();
            // A semantic preflight rejection can have a successful underlying process exit.
            if (ToolExecutionStatus.SUCCEEDED.wire().equals(terminal) && !result.success()) terminal = ToolExecutionStatus.FAILED.wire();
            var status = terminal;
            var out = clip(result.stdout()); var err = clip(result.stderr());
            boolean truncated = Boolean.TRUE.equals(result.metadata().get("truncated"))
                    || SensitiveData.redact(result.stdout()).length() > 8000 || SensitiveData.redact(result.stderr()).length() > 8000;
            persist(row.id(), value -> value.active()
                    ? value.state(status, value.cancelRequested(), Instant.now(), result.exitCode(), out, err,
                            truncated, outcome.exitEvidence(), null, value.steps()) : value);
        } catch (ResponseStatusException denied) {
            try { reject(row.id(), denied.getReason()); }
            catch (RuntimeException unavailable) { recordFailure(row.id()); }
        } catch (RuntimeException failure) {
            // Includes identity/result write failures after a process started. Never invent a terminal outcome.
            recordFailure(row.id());
        } finally { active.remove(row.id()); capacity.release(); }
    }
    private ToolExecution persist(UUID id, UnaryOperator<ToolExecution> transition) {
        try { return store.update(id, transition); }
        catch (TransactionException unavailable) {
            // The application owns transaction uncertainty; HTTP adapters only map a stable storage error.
            throw new DataAccessResourceFailureException("Tool execution write outcome unconfirmed", unavailable);
        }
    }
    private void saveSteps(UUID id, List<ToolExecution.Step> steps) {
        persist(id, row -> {
            if (!row.active()) throw new IllegalStateException("Execution is not active");
            return row.state(row.status(), row.cancelRequested(), null, row.exitCode(), row.stdout(), row.stderr(),
                    row.truncated(), row.exitEvidence(), row.unconfirmedReason(), steps);
        });
    }
    private void reject(UUID id, String reason) {
        persist(id, row -> row.active() ? row.state(ToolExecutionStatus.REJECTED.wire(), row.cancelRequested(), Instant.now(), null,
                "", clip(reason), false, row.steps().isEmpty() ? "PROCESS_NOT_STARTED" : "NO_FURTHER_PROCESS_STARTED", null, row.steps()) : row);
    }
    private ToolExecution unknown(UUID id, String reason) {
        return persist(id, row -> row.active() ? row.state(ToolExecutionStatus.UNKNOWN.wire(), row.cancelRequested(), null,
                row.exitCode(), row.stdout(), row.stderr(), row.truncated(), null, reason, row.steps()) : row);
    }
    private void recordFailure(UUID id) {
        try { unknown(id, ExecutionErrors.EXECUTION_EVIDENCE_UNCONFIRMED.code()); }
        catch (RuntimeException unavailable) { LOG.error("Tool execution {} evidence persistence unavailable", id); }
    }
    private static void validateOperation(String operation) {
        if (!"git-status".equals(operation) && !"git-diff".equals(operation))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ToolErrors.TOOL_OPERATION_NOT_FOUND.code());
    }
    private static ToolExecution sameOperation(ToolExecution row, String operation) {
        if (!row.capabilityId().equals(operation))
            throw new ResponseStatusException(HttpStatus.CONFLICT, ToolErrors.REQUEST_ID_OPERATION_CONFLICT.code());
        return row;
    }
    private String authorize(Path root, String operation) {
        validateOperation(operation);
        if (!workspace().equals(root)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, WorkspaceErrors.WORKSPACE_CHANGED.code());
        if (!settings.enabled(operation)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, ToolErrors.CAPABILITY_DISABLED.code());
        if (!(handlers.resolveFor(null, operation).orElse(null) instanceof GitInspectionHandler))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "git-status".equals(operation) ? GitErrors.GIT_STATUS_HANDLER_MISSING.code() : GitErrors.GIT_DIFF_HANDLER_MISSING.code());
        var registered = capabilities.all().stream().filter(value -> value.name().equals(operation)).findFirst().orElse(null);
        if (!(registered instanceof GitCapability git))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "git-status".equals(operation) ? GitErrors.GIT_STATUS_CAPABILITY_MISSING.code() : GitErrors.GIT_DIFF_CAPABILITY_MISSING.code());
        final String executable;
        try { executable = git.executable(); }
        catch (IllegalStateException unavailable) {
            if (CliProgramErrors.CLI_PROGRAM_BINDING_CONFLICT.code().equals(unavailable.getMessage()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, CliProgramErrors.CLI_PROGRAM_BINDING_CONFLICT.code());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, CliProgramErrors.CLI_BINDING_UNAVAILABLE.code());
        }
        return LocalBinaries.resolve(executable).map(path -> path.toAbsolutePath().normalize().toString())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, ExecutionErrors.BINARY_MISSING.code()));
    }
    private Path workspace() {
        var decision = runtime.root();
        if (!decision.allowed() || decision.path() == null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code());
        try { return decision.path().toRealPath(); }
        catch (IOException missing) { throw new ResponseStatusException(HttpStatus.FORBIDDEN, WorkspaceErrors.AUTHORIZED_ROOT_MISSING.code()); }
    }
    private static String clip(String value) {
        var redacted = SensitiveData.redact(value == null ? "" : value);
        return redacted.substring(0, Math.min(8000, redacted.length()));
    }
    @PreDestroy public void close() {
        active.values().forEach(token -> token.set(true));
        workers.shutdown();
        try { if (!workers.awaitTermination(10, TimeUnit.SECONDS)) workers.shutdownNow(); }
        catch (InterruptedException interrupted) { workers.shutdownNow(); Thread.currentThread().interrupt(); }
    }
    public static final class Blocked extends ResponseStatusException {
        private final ToolExecution execution;
        public Blocked(ToolExecution execution) { super(HttpStatus.CONFLICT, ToolErrors.TOOL_EXECUTION_BLOCKED.code()); this.execution = execution; }
        public ToolExecution execution() { return execution; }
    }
}
