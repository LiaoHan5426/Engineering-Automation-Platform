package com.lh.eap.application.service;
import com.lh.eap.error.BoardErrors;

import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Selects a persisted design version; never accepts a client-provided design body or hash. */
@Service
public class BoardPrototypeService {
    public record Selection(String projectId, long revision, UUID versionId) {}
    public record Reference(UUID id, String sourceRef, String title, String contentHash, Instant createdAt) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final BoardTaskService tasks;
    private final PrototypeVersionService versions;
    public BoardPrototypeService(JdbcTemplate jdbc, BoardTaskService tasks, PrototypeVersionService versions) {
        this.jdbc = jdbc; this.tasks = tasks; this.versions = versions;
    }
    @Transactional public BoardTaskService.Task select(UUID taskId, Selection selection) {
        if (selection.projectId() == null || selection.projectId().isBlank() || selection.projectId().length() > 120 || selection.revision() < 1) throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_FIELD.code());
        var task = tasks.find(taskId, selection.projectId(), true);
        if (task.revision() != selection.revision()) throw conflict(BoardErrors.BOARD_REVISION_CONFLICT.code());
        if (tasks.hasActiveExecution(taskId)) throw conflict(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
        if (!Set.of("planned", "ready").contains(task.column())) throw conflict(BoardErrors.BOARD_EXECUTION_EVIDENCE_REQUIRED.code());
        if (selection.versionId() != null) versions.find(selection.versionId());
        if (Objects.equals(task.prototypeVersionId(), selection.versionId())) return task;
        var events = new ArrayList<>(task.events());
        events.add(selection.versionId() == null ? "prototype_unlinked" : "prototype_linked");
        jdbc.update("UPDATE eap.board_task SET prototype_version_id=?,revision=revision+1,events=?::jsonb WHERE id=? AND project_id=?",
                selection.versionId(), JSON.writeValueAsString(events), taskId, selection.projectId());
        return tasks.find(taskId, selection.projectId(), false);
    }
    public Reference reference(UUID versionId) {
        if (versionId == null) return null;
        var version = versions.find(versionId);
        return new Reference(version.id(), version.sourceRef(), version.title(), version.contentHash(), version.createdAt());
    }
    private static ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
}
