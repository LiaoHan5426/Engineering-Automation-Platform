package com.lh.eap.application.service;

import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import java.nio.file.Path;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

@Service
public class BoardReviewService {
    public record Request(String projectId, String workspacePath) {}
    public record Page(GitReviewCapture.Evidence evidence, boolean captureAllowed, String reason) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final BoardTaskService tasks;
    private final MissionExecutionStore executions;
    private final MissionGitExecutionService git;
    private final CapabilityRegistry registry;
    private final CapabilityHandlerRegistry handlers;
    private final CapabilitySettings settings;
    private final GitReviewCapture capture;
    public BoardReviewService(JdbcTemplate jdbc, BoardTaskService tasks, MissionExecutionStore executions, MissionGitExecutionService git,
                              CapabilityRegistry registry, CapabilityHandlerRegistry handlers, CapabilitySettings settings, GitReviewCapture capture) {
        this.jdbc=jdbc; this.tasks=tasks; this.executions=executions; this.git=git; this.registry=registry; this.handlers=handlers; this.settings=settings; this.capture=capture;
    }
    public Page get(UUID taskId, UUID executionId, String projectId) {
        requireProject(projectId); var task = tasks.find(taskId, projectId, false); var saved = read(taskId, executionId);
        String reason = task.executionActive() ? "BOARD_EXECUTION_ACTIVE" : denial(executionId);
        return new Page(saved, saved == null && reason.isEmpty(), reason);
    }
    @Transactional(timeout = 90)
    public GitReviewCapture.Evidence collect(UUID taskId, UUID executionId, Request request) {
        requireProject(request.projectId());
        if (request.workspacePath() == null || request.workspacePath().isBlank() || request.workspacePath().length() > 2048) throw new IllegalArgumentException("INVALID_BOARD_REVIEW_REQUEST");
        tasks.find(taskId, request.projectId(), true);
        var saved = read(taskId, executionId); var run = executions.find(executionId).orElseThrow();
        if (!request.workspacePath().equals(run.workspacePath())) throw conflict("BOARD_WORKSPACE_CHANGED");
        if (saved != null) return saved; // A retry reads the original observation, never re-scans changed files.
        if (tasks.hasActiveExecution(taskId)) throw conflict("BOARD_EXECUTION_ACTIVE");
        var reason = denial(executionId);
        if (!reason.isEmpty()) throw conflict(reason);
        var evidence = capture.capture(Path.of(run.workspacePath()), capability());
        jdbc.update("UPDATE eap.board_task_run SET review_snapshot=?::jsonb WHERE task_id=? AND execution_id=? AND review_snapshot IS NULL", JSON.writeValueAsString(evidence), taskId, executionId);
        return evidence;
    }
    private String denial(UUID executionId) {
        var execution = executions.find(executionId).orElseThrow();
        if (!"SUCCEEDED".equals(execution.status()) || execution.unconfirmedReason() != null) return "BOARD_REVIEW_RUN_NOT_SUCCEEDED";
        var available = git.availability();
        if (!available.allowed()) return available.reason();
        if (!available.workspacePath().equals(execution.workspacePath())) return "BOARD_WORKSPACE_CHANGED";
        if (!settings.enabled("git-diff")) return "CAPABILITY_DISABLED";
        if (!(handlers.resolveFor(null, "git-diff").orElse(null) instanceof GitInspectionHandler) || capability() == null) return "CAPABILITY_UNRESOLVED";
        if (!capability().runnable() || !capability().executable().equals(execution.executable())) return "BOARD_WORKSPACE_CHANGED";
        return "";
    }
    private GitCapability capability() { return registry.all().stream().filter(item -> item.name().equals("git-diff") && item instanceof GitCapability).map(item -> (GitCapability)item).findFirst().orElse(null); }
    private GitReviewCapture.Evidence read(UUID taskId, UUID executionId) {
        var rows = jdbc.query("SELECT review_snapshot FROM eap.board_task_run WHERE task_id=? AND execution_id=?", (rs, row) -> {
            String value = rs.getString(1); return value == null ? Optional.<GitReviewCapture.Evidence>empty() : Optional.of(JSON.readValue(value, GitReviewCapture.Evidence.class));
        }, taskId, executionId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "BOARD_RUN_NOT_FOUND");
        return rows.getFirst().orElse(null);
    }
    private static void requireProject(String id) { if (id == null || id.isBlank() || id.length() > 120) throw new IllegalArgumentException("INVALID_BOARD_FIELD"); }
    private static ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
}
