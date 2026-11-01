package com.lh.eap.application.service;

import com.lh.eap.api.ExecutionContext;
import com.lh.eap.api.Observation;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MissionGitExecutionService {
    static final String OPEN_EXECUTION = "mission_execution_one_open";
    static final String RESTART_UNKNOWN = "结果未知：服务重启后无法确认进程树是否结束";
    private final MissionStore missions;
    private final MissionExecutionStore executions;
    private final CapabilityHandlerRegistry handlers;
    private final CapabilitySettings settings;
    private final CapabilityRegistry capabilities;
    private final ProcessExecutor executor;
    private final RuntimeWorkspace runtime;

    public MissionGitExecutionService(MissionStore missions, MissionExecutionStore executions,
                                      CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                                      CapabilityRegistry capabilities, ProcessExecutor executor,
                                      RuntimeWorkspace runtime) {
        this.missions = missions;
        this.executions = executions;
        this.handlers = handlers;
        this.settings = settings;
        this.capabilities = capabilities;
        this.executor = executor;
        this.runtime = runtime;
    }

    public List<MissionExecution> list(UUID missionId) {
        requireMission(missionId);
        return executions.list(missionId);
    }

    public MissionExecution start(UUID missionId) {
        if ("board".equals(requireMission(missionId).source())) throw new ResponseStatusException(HttpStatus.CONFLICT, "BOARD_RUN_ENDPOINT_REQUIRED");
        var open = executions.open(missionId);
        if (open.isPresent()) return open.get();
        var prepared = authorize();
        var capability = prepared.capability();
        var id = UUID.randomUUID();
        var now = Instant.now();
        var created = new MissionExecution(id, missionId, "CREATED", "git-status", runtime.operatorLabel(),
                prepared.workspace().toString(), prepared.label(), capability.executable(), prepared.policy(),
                null, null, null, null, now, null, null, null, null, null, null, false, "NOT_REQUIRED", now);
        try {
            executions.insertOpen(created);
        } catch (DuplicateKeyException conflict) {
            if (!namesOpenExecution(conflict)) throw conflict;
            return executions.open(missionId).orElseThrow(() -> conflict);
        } catch (DataAccessException failure) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "数据服务暂不可用，请检查数据库、迁移和后端日志");
        }
        return executePrepared(created, prepared);
    }

    public record Availability(boolean allowed, String workspacePath, String workspaceLabel, String reason) {}

    /** Read-only server policy preview; client paths never grant access. */
    public Availability availability() {
        try {
            var prepared = authorize();
            return new Availability(true, prepared.workspace().toString(), prepared.label(), "");
        } catch (ResponseStatusException denied) {
            return new Availability(false, runtime.workspace() == null ? "" : runtime.workspace().toAbsolutePath().normalize().toString(), runtime.workspaceLabel(), denied.getReason());
        }
    }

    /** Called inside the board's transaction, before dispatching any process. */
    public MissionExecution reserve(UUID missionId, UUID id, String confirmedWorkspace) {
        requireMission(missionId);
        var prepared = authorize();
        if (!prepared.workspace().toString().equals(confirmedWorkspace)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "BOARD_WORKSPACE_CHANGED");
        }
        var now = Instant.now();
        var created = new MissionExecution(id, missionId, "CREATED", "git-status", runtime.operatorLabel(),
                prepared.workspace().toString(), prepared.label(), prepared.capability().executable(), prepared.policy(),
                null, null, null, null, now, null, null, null, null, null, null, false, "NOT_REQUIRED", now);
        executions.insertOpen(created);
        return created;
    }

    /** A persisted queue entry may run once, only in the JVM that accepted it. */
    public MissionExecution runReserved(UUID executionId) {
        var created = executions.find(executionId).orElseThrow();
        if (!executions.claimCreated(executionId)) return executions.find(executionId).orElseThrow();
        final Prepared prepared;
        try {
            prepared = authorize();
            if (!prepared.workspace().toString().equals(created.workspacePath()) || !prepared.capability().executable().equals(created.executable())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "BOARD_WORKSPACE_CHANGED");
            }
        } catch (ResponseStatusException denied) {
            executions.failSameRow(executionId, created.missionId(), denied.getReason());
            return executions.find(executionId).orElseThrow();
        }
        return executePrepared(created, prepared);
    }

    private MissionExecution executePrepared(MissionExecution created, Prepared prepared) {
        var id = created.id(); var missionId = created.missionId();
        try {
            var observation = prepared.capability().executeManaged(id, new ExecutionContext(prepared.workspace(), executor));
            remember(id, observation.metadata());
            return complete(id, missionId, observation);
        } catch (RuntimeException rejected) {
            executions.failSameRow(id, missionId, rejected.getClass().getSimpleName());
            var failed = executions.find(id).orElseThrow();
            if (!"FAILED".equals(failed.status())) throw rejected;
            return failed;
        }
    }

    public MissionExecution cancel(UUID missionId, UUID executionId) {
        if ("board".equals(requireMission(missionId).source())) throw new ResponseStatusException(HttpStatus.CONFLICT, "BOARD_CANCEL_NOT_AVAILABLE");
        var execution = executions.find(executionId)
                .filter(row -> row.missionId().equals(missionId))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "执行不存在"));
        if (!"CREATED".equals(execution.status()) && !"RUNNING".equals(execution.status())) {
            return execution;
        }
        executions.markCancelling(executionId);
        executor.cancel(executionId);
        return executions.find(executionId).orElseThrow();
    }

    /** Restart does not take over or destroy processes. An unknown in-flight row blocks another start. */
    public void markRestartUnknown() {
        for (var execution : executions.openAll()) {
            executions.unconfirmed(execution.id(), RESTART_UNKNOWN);
        }
    }

    private MissionExecution complete(UUID id, UUID missionId, Observation observation) {
        var current = executions.find(id).orElseThrow();
        var metadata = new LinkedHashMap<String, Object>();
        if (observation.metadata() != null) metadata.putAll(observation.metadata());
        metadata.put("exitCode", observation.exitCode());
        var outcome = MissionRunOutcome.from(String.valueOf(metadata.get("executorStatus")), metadata, current.cancelRequested());
        if (!outcome.terminal()) {
            executions.unconfirmed(id, outcome.unconfirmedReason());
            return executions.find(id).orElseThrow();
        }
        executions.finish(id, missionId, outcome.status(), outcome.projection(), outcome.exitEvidence(),
                observation.exitCode(), clip(observation.stdout()), clip(observation.stderr()), current.cancelRequested());
        return executions.find(id).orElseThrow();
    }

    private void remember(UUID id, Map<String, Object> identity) {
        var pid = identity.get("processPid");
        if (!(pid instanceof Long value)) return;
        var started = identity.get("processStartedAt") instanceof String text && !text.isBlank() ? Instant.parse(text) : null;
        executions.rememberProcess(id, value, started, String.valueOf(identity.getOrDefault("processUser", "")),
                String.valueOf(identity.getOrDefault("processExecutable", "")));
    }

    private Prepared authorize() {
        var resolved = handlers.resolveFor(null, "git-status");
        var registered = capabilities.all().stream().filter(item -> "git-status".equals(item.name())).findFirst().orElse(null);
        var git = registered instanceof GitCapability typed ? typed : null;
        if (runtime.root().denial() != null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, runtime.root().denial());
        }
        var directory = realDirectory(runtime.workspace());
        if (git != null && !git.runnable()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "BINARY_MISSING");
        }
        var decision = MissionGitAuthorization.decide(resolved.isPresent(), resolved.orElse(null) instanceof GitInspectionHandler,
                settings.enabled("git-status"), git != null, runtime.root().path(), directory);
        if (!decision.allowed() || git == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, decision.reason());
        }
        var policy = "operatorLabel=" + runtime.operatorLabel()
                + ";capability=git-status;approval=NOT_REQUIRED;reason=" + decision.reason();
        return new Prepared(directory, runtime.workspaceLabel(), git, policy);
    }

    private static boolean namesOpenExecution(DuplicateKeyException conflict) {
        var text = conflict.getMessage();
        var cause = conflict.getMostSpecificCause() == null ? null : conflict.getMostSpecificCause().getMessage();
        return (text != null && text.contains(OPEN_EXECUTION)) || (cause != null && cause.contains(OPEN_EXECUTION));
    }

    private Mission requireMission(UUID missionId) {
        return missions.find(missionId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "任务壳不存在"));
    }

    private static Path realDirectory(Path path) {
        try {
            if (path == null || !Files.isDirectory(path)) return null;
            return path.toRealPath();
        } catch (IOException failure) {
            return null;
        }
    }

    private static String clip(String text) {
        var redacted = SensitiveData.redact(text == null ? "" : text);
        return redacted.length() <= 8000 ? redacted : redacted.substring(0, 8000);
    }

    private record Prepared(Path workspace, String label, GitCapability capability, String policy) {}
}
