package com.lh.eap.delivery;

import com.lh.eap.api.TaskRef;
import com.lh.eap.application.service.BoardCodeTaskBinding;
import com.lh.eap.core.CodeEvidenceStore;
import com.lh.eap.core.CodeGenerationEvidenceStore;
import com.lh.eap.core.CodeTaskBinding;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.stereotype.Repository;

/**
 * Workflow-side mapping adapter. Board task rules stay in {@link BoardCodeTaskBinding}; all SQL
 * lives in {@link CodeGenerationEvidenceStore}'s JDBC implementation.
 */
@Repository
public class CodeGenerationStoreAdapter implements CodeGenerationStore, CodeTaskBinding {
    private final CodeGenerationEvidenceStore store;
    private final BoardCodeTaskBinding tasks;

    public CodeGenerationStoreAdapter(CodeGenerationEvidenceStore store, BoardCodeTaskBinding tasks) {
        this.store = store;
        this.tasks = tasks;
    }

    @Override public Snapshot capture(TaskRef ref, String workspace, String prototypeId,
                                      Function<TaskSnapshot, Snapshot> capture) {
        return map(store.capture(ref, workspace, prototypeId, this, task -> map(capture.apply(map(task)))));
    }

    @Override public void save(Snapshot snapshot) { store.save(map(snapshot)); }

    @Override public TaskSnapshot planningTask(TaskRef ref) { return map(store.planningTask(ref, this)); }

    @Override public Optional<Snapshot> find(UUID id) { return store.find(id).map(CodeGenerationStoreAdapter::map); }

    // --- CodeTaskBinding: Board rules stay in the workflow service; only the port crosses the boundary. ---
    @Override public void lock(TaskRef ref) { tasks.lock(ref); }

    @Override public CodeEvidenceStore.TaskSnapshot captureLocked(TaskRef ref, String prototypeId) {
        return map(tasks.captureLocked(ref, prototypeId));
    }

    @Override public CodeEvidenceStore.TaskSnapshot planningLocked(TaskRef ref) {
        return map(tasks.planningLocked(ref));
    }

    @Override public void validateLocked(CodeEvidenceStore.TaskSnapshot expected) {
        tasks.validateLocked(map(expected));
    }

    private static CodeEvidenceStore.TaskSnapshot map(TaskSnapshot task) {
        return task == null ? null : new CodeEvidenceStore.TaskSnapshot(task.projectId(), task.taskId(), task.revision(),
                task.title(), task.goal(), task.acceptanceCriteria(), task.notes(), task.prototype());
    }

    private static TaskSnapshot map(CodeEvidenceStore.TaskSnapshot task) {
        return task == null ? null : new TaskSnapshot(task.projectId(), task.taskId(), task.revision(),
                task.title(), task.goal(), task.acceptanceCriteria(), task.notes(), task.prototype());
    }

    private static CodeEvidenceStore.Snapshot map(Snapshot snapshot) {
        return new CodeEvidenceStore.Snapshot(snapshot.id(), snapshot.principal(), snapshot.conversationId(),
                snapshot.workspace(), snapshot.targetPath(), snapshot.baseHash(), snapshot.source(),
                snapshot.prototypeVersionId(), snapshot.prototypeContentHash(), snapshot.capturedAt(),
                map(snapshot.taskSnapshot()), snapshot.companionSources().stream()
                        .map(source -> new CodeEvidenceStore.Source(source.path(), source.baseHash(), source.content())).toList());
    }

    private static Snapshot map(CodeEvidenceStore.Snapshot snapshot) {
        return new Snapshot(snapshot.id(), snapshot.principal(), snapshot.conversationId(), snapshot.workspace(),
                snapshot.targetPath(), snapshot.baseHash(), snapshot.source(), snapshot.prototypeVersionId(),
                snapshot.prototypeContentHash(), snapshot.capturedAt(), map(snapshot.taskSnapshot()),
                snapshot.companionSources().stream()
                        .map(source -> new ComponentGraph.Source(source.path(), source.baseHash(), source.content())).toList());
    }
}
