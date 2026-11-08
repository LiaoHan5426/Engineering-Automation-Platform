package com.lh.eap.application.service;
import com.lh.eap.delivery.CodeGenerationStore;

import com.lh.eap.delivery.CodeGenerationStore.TaskSnapshot;
import com.lh.eap.api.TaskRef;
import java.util.Objects;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Narrow bridge to Board rules. Caller owns one transaction and task-before-workspace ordering. */
@Service
public class BoardCodeTaskBinding {
    private final BoardTaskService tasks;
    private final PrototypeVersionStore prototypes;
    public BoardCodeTaskBinding(BoardTaskService tasks, PrototypeVersionStore prototypes) {
        this.tasks = tasks; this.prototypes = prototypes;
    }
    public void lock(TaskRef ref) {
        if (!org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Task binding requires transaction");
        tasks.find(ref.taskId(), ref.projectId(), true);
    }
    public TaskSnapshot captureLocked(TaskRef ref, String prototypeId) {
        // Separate READ COMMITTED statement after row/workspace locks, never reuse a waiting SELECT snapshot.
        var task = tasks.find(ref.taskId(), ref.projectId(), false);
        if (task.revision() != ref.revision()) throw conflict("BOARD_REVISION_CONFLICT");
        if (!task.column().equals("ready") || !task.preparationIssues().isEmpty()) throw conflict("BOARD_PREPARATION_REQUIRED");
        if (tasks.hasActiveExecution(task.id())) throw conflict("BOARD_EXECUTION_ACTIVE");
        if (!Objects.equals(task.prototypeVersionId() == null ? "" : task.prototypeVersionId().toString(), prototypeId))
            throw conflict("CODE_TASK_PROTOTYPE_MISMATCH");
        var prototype = task.prototypeVersionId() == null ? null : prototypes.find(task.prototypeVersionId())
                .orElseThrow(() -> conflict("CODE_TASK_PROTOTYPE_MISMATCH"));
        return new TaskSnapshot(task.projectId(), task.id(), task.revision(), task.title(), task.goal(), task.acceptanceCriteria(), prototype);
    }

    public void validateLocked(TaskSnapshot expected) {
        String prototypeId = expected.prototype() == null ? "" : expected.prototype().id().toString();
        if (!expected.equals(captureLocked(expected.binding(), prototypeId))) throw conflict("CODE_TASK_SNAPSHOT_CHANGED");
    }
    private static ResponseStatusException conflict(String code) { return new ResponseStatusException(HttpStatus.CONFLICT, code); }
}
