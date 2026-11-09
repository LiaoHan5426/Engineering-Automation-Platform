package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.LocalBinaries;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Path;
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
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(ToolExecutionService.class);
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
        if (requestId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "REQUEST_ID_REQUIRED");
        var workspace = workspace();
        var prior = store.request(workspace.toString(), requestId);
        if (prior.isPresent()) return sameOperation(prior.get(), operation);
        var blocking = store.blocking(workspace.toString(), operation);
        if (blocking.isPresent()) throw new Blocked(blocking.get());
        var binary = authorize(workspace, operation);
        if (!capacity.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "TOOL_EXECUTION_CAPACITY");
        var id = UUID.randomUUID();
        var token = new AtomicBoolean();
        var row = new ToolExecution(id, requestId, "git", operation, workspace.toString(), binary,
                "CREATED", false, Instant.now(), null, null, "", "", false, null, null, List.of());
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
            store.update(id, current -> current.state(current.cancelRequested() ? "CANCELLED" : "FAILED", current.cancelRequested(), Instant.now(), null,
                    "", "WORKER_UNAVAILABLE", false, "PROCESS_NOT_STARTED", null, current.steps()));
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "WORKER_UNAVAILABLE");
        }
        return row;
    }

    public List<ToolExecution> list(int limit) { return list("git-status", limit); }
    public List<ToolExecution> list(String operation, int limit) {
        validateOperation(operation);
        if (limit < 1 || limit > 100) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_LIMIT");
        return store.list(workspace().toString(), operation, limit).stream().map(this::confirmOwnership).toList();
    }
    public ToolExecution get(UUID id) { return get("git-status", id); }
    public ToolExecution get(String operation, UUID id) { return confirmOwnership(require(operation, id)); }
    public ToolExecution cancel(UUID id) { return cancel("git-status", id); }
    public ToolExecution cancel(String operation, UUID id) {
        require(operation, id);
        var row = store.update(id, current -> current.active()
                ? current.state("CANCELLING", true, null, current.exitCode(), current.stdout(), current.stderr(),
                        current.truncated(), current.exitEvidence(), current.unconfirmedReason(), current.steps()) : current);
        if (row.active()) {
            var token = active.get(id);
            if (token != null) token.set(true);
        }
        return confirmOwnership(row);
    }
    private ToolExecution require(String operation, UUID id) {
        validateOperation(operation);
        var root = workspace().toString();
        return store.find(id).filter(row -> row.workspacePath().equals(root) && row.capabilityId().equals(operation))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "TOOL_EXECUTION_NOT_FOUND"));
    }
    private ToolExecution confirmOwnership(ToolExecution row) {
        if (row.active() && !active.containsKey(row.id())) return unknown(row.id(), "EXECUTION_OWNER_UNAVAILABLE");
        return row;
    }

    private void execute(ToolExecution row, AtomicBoolean cancelled) {
        try {
            // Revalidate at dispatch; never silently select a new executable or workspace.
            if (!authorize(Path.of(row.workspacePath()), row.capabilityId()).equals(row.executable())) {
                reject(row.id(), "TOOL_BINDING_CHANGED"); return;
            }
            var current = store.update(row.id(), value -> value.active()
                    ? value.state(value.cancelRequested() ? "CANCELLING" : "RUNNING", value.cancelRequested(),
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
                    var child = UUID.randomUUID();
                    var phase = switch (observed.size()) { case 0 -> "root"; case 1 -> "filters"; default -> row.capabilityId().substring(4); };
                    var pending = new ToolExecution.Step(child, phase, "CREATED", command, Map.of());
                    observed.add(pending);
                    saveSteps(row.id(), observed);
                    var result = executor.runManaged(child, capability, directory, command, environment, new ManagedProcessControl() {
                        public boolean cancellationRequested() { return cancelled.get(); }
                        public void started(Map<String, Object> identity) {
                            observed.set(observed.size() - 1, new ToolExecution.Step(child, phase, "RUNNING", command, identity));
                            saveSteps(row.id(), observed);
                        }
                    });
                    var facts = new LinkedHashMap<>(result.metadata());
                    facts.remove("trace"); facts.remove("command");
                    facts.put("exitCode", result.exitCode());
                    observed.set(observed.size() - 1, new ToolExecution.Step(child, phase,
                            String.valueOf(facts.getOrDefault("executorStatus", "UNKNOWN")), command, facts));
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
            if ("SUCCEEDED".equals(terminal) && !result.success()) terminal = "FAILED";
            var status = terminal;
            var out = clip(result.stdout()); var err = clip(result.stderr());
            boolean truncated = Boolean.TRUE.equals(result.metadata().get("truncated"))
                    || SensitiveData.redact(result.stdout()).length() > 8000 || SensitiveData.redact(result.stderr()).length() > 8000;
            store.update(row.id(), value -> value.active()
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
    private void saveSteps(UUID id, List<ToolExecution.Step> steps) {
        store.update(id, row -> {
            if (!row.active()) throw new IllegalStateException("Execution is not active");
            return row.state(row.status(), row.cancelRequested(), null, row.exitCode(), row.stdout(), row.stderr(),
                    row.truncated(), row.exitEvidence(), row.unconfirmedReason(), steps);
        });
    }
    private void reject(UUID id, String reason) {
        store.update(id, row -> row.active() ? row.state("REJECTED", row.cancelRequested(), Instant.now(), null,
                "", clip(reason), false, "PROCESS_NOT_STARTED", null, row.steps()) : row);
    }
    private ToolExecution unknown(UUID id, String reason) {
        return store.update(id, row -> row.active() ? row.state("UNKNOWN", row.cancelRequested(), null,
                row.exitCode(), row.stdout(), row.stderr(), row.truncated(), null, reason, row.steps()) : row);
    }
    private void recordFailure(UUID id) {
        try { unknown(id, "EXECUTION_EVIDENCE_UNCONFIRMED"); }
        catch (RuntimeException unavailable) { LOG.error("Tool execution {} evidence persistence unavailable", id); }
    }
    private static void validateOperation(String operation) {
        if (!"git-status".equals(operation) && !"git-diff".equals(operation))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "TOOL_OPERATION_NOT_FOUND");
    }
    private static ToolExecution sameOperation(ToolExecution row, String operation) {
        if (!row.capabilityId().equals(operation))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "REQUEST_ID_OPERATION_CONFLICT");
        return row;
    }
    private String authorize(Path root, String operation) {
        validateOperation(operation);
        if (!workspace().equals(root)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "WORKSPACE_CHANGED");
        if (!settings.enabled(operation)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "CAPABILITY_DISABLED");
        if (!(handlers.resolveFor(null, operation).orElse(null) instanceof GitInspectionHandler))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "git-status".equals(operation) ? "GIT_STATUS_HANDLER_MISSING" : "GIT_DIFF_HANDLER_MISSING");
        var registered = capabilities.all().stream().filter(value -> value.name().equals(operation)).findFirst().orElse(null);
        if (!(registered instanceof GitCapability git))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "git-status".equals(operation) ? "GIT_STATUS_CAPABILITY_MISSING" : "GIT_DIFF_CAPABILITY_MISSING");
        final String executable;
        try { executable = git.executable(); }
        catch (IllegalStateException unavailable) {
            if ("CLI_PROGRAM_BINDING_CONFLICT".equals(unavailable.getMessage()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "CLI_PROGRAM_BINDING_CONFLICT");
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CLI_BINDING_UNAVAILABLE");
        }
        return LocalBinaries.resolve(executable).map(path -> path.toAbsolutePath().normalize().toString())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "BINARY_MISSING"));
    }
    private Path workspace() {
        var decision = runtime.root();
        if (!decision.allowed() || decision.path() == null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "AUTHORIZED_ROOT_MISSING");
        try { return decision.path().toRealPath(); }
        catch (IOException missing) { throw new ResponseStatusException(HttpStatus.FORBIDDEN, "AUTHORIZED_ROOT_MISSING"); }
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
        public Blocked(ToolExecution execution) { super(HttpStatus.CONFLICT, "TOOL_EXECUTION_BLOCKED"); this.execution = execution; }
        public ToolExecution execution() { return execution; }
    }
}
