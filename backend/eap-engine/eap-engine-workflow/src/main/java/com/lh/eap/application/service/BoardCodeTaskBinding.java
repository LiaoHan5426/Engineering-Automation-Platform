package com.lh.eap.application.service;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.lh.eap.error.BoardErrors;
import com.lh.eap.error.CodeErrors;
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
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Task binding requires transaction");
        tasks.find(ref.taskId(), ref.projectId(), true);
    }
    public TaskSnapshot captureLocked(TaskRef ref, String prototypeId) {
        // Separate READ COMMITTED statement after row/workspace locks, never reuse a waiting SELECT snapshot.
        var task = tasks.find(ref.taskId(), ref.projectId(), false);
        if (task.revision() != ref.revision()) throw conflict(BoardErrors.BOARD_REVISION_CONFLICT.code());
        if (!task.column().equals("ready") || !task.preparationIssues().isEmpty()) throw conflict(BoardErrors.BOARD_PREPARATION_REQUIRED.code());
        if (tasks.hasActiveExecution(task.id())) throw conflict(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
        if (!Objects.equals(task.prototypeVersionId() == null ? "" : task.prototypeVersionId().toString(), prototypeId))
            throw conflict(CodeErrors.CODE_TASK_PROTOTYPE_MISMATCH.code());
        var prototype = task.prototypeVersionId() == null ? null : prototypes.find(task.prototypeVersionId())
                .orElseThrow(() -> conflict(CodeErrors.CODE_TASK_PROTOTYPE_MISMATCH.code()));
        return new TaskSnapshot(task.projectId(), task.id(), task.revision(), task.title(), task.goal(), task.acceptanceCriteria(), task.notes(), prototype);
    }

    public TaskSnapshot planningLocked(TaskRef ref) {
        var task = tasks.find(ref.taskId(), ref.projectId(), false);
        if (task.revision() != ref.revision()) throw conflict(BoardErrors.BOARD_REVISION_CONFLICT.code());
        if (!java.util.Set.of(BoardTaskColumn.PLANNED.wire(), BoardTaskColumn.READY.wire()).contains(task.column()))
            throw conflict(BoardErrors.BOARD_PREPARATION_REQUIRED.code());
        if (tasks.hasActiveExecution(task.id())) throw conflict(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
        var prototype = task.prototypeVersionId() == null ? null : prototypes.find(task.prototypeVersionId())
                .orElseThrow(() -> conflict(CodeErrors.CODE_TASK_PROTOTYPE_MISMATCH.code()));
        return new TaskSnapshot(task.projectId(), task.id(), task.revision(), task.title(), task.goal(), task.acceptanceCriteria(), task.notes(), prototype);
    }

    public void validateLocked(TaskSnapshot expected) {
        String prototypeId = expected.prototype() == null ? "" : expected.prototype().id().toString();
        if (!expected.equals(captureLocked(expected.binding(), prototypeId))) throw conflict(CodeErrors.CODE_TASK_SNAPSHOT_CHANGED.code());
    }
    private static ResponseStatusException conflict(String code) { return new ResponseStatusException(HttpStatus.CONFLICT, code); }
}
