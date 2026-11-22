package com.lh.eap.persistence.jdbc;

import com.lh.eap.api.TaskRef;
import com.lh.eap.core.CodeEvidenceStore;
import com.lh.eap.core.CodeGenerationEvidenceStore;
import com.lh.eap.core.CodeTaskBinding;
import com.lh.eap.core.WorkspaceLockStore;
import com.lh.eap.error.CodeErrors;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Immutable generation evidence SQL. Business rules and Board rules stay outside this adapter. */
@Repository
public class JdbcCodeGenerationStore implements CodeGenerationEvidenceStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final WorkspaceLockStore locks;
    private final TransactionTemplate transaction;

    public JdbcCodeGenerationStore(JdbcTemplate jdbc, PlatformTransactionManager manager, WorkspaceLockStore locks) {
        this.jdbc = jdbc;
        this.locks = locks;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setTimeout(10);
    }

    private void lockWorkspace(String workspace) {
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Workspace reservation requires a transaction");
        locks.lock(workspace);
    }

    private void requireWorkspaceIdle(String workspace) {
        if (locks.codeActive(workspace) || locks.boardActive(workspace))
            throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.CODE_WORKSPACE_BUSY.code());
    }

    @Override
    public CodeEvidenceStore.Snapshot capture(TaskRef ref, String workspace, String prototypeId, CodeTaskBinding binding,
                                              Function<CodeEvidenceStore.TaskSnapshot, CodeEvidenceStore.Snapshot> capture) {
        return transaction.execute(tx -> {
            if (ref != null) {
                binding.lock(ref);
                lockWorkspace(workspace);
                requireWorkspaceIdle(workspace);
            }
            var snapshot = capture.apply(ref == null ? null : binding.captureLocked(ref, prototypeId));
            insert(snapshot); // Do not call REQUIRES_NEW save while holding a task lock.
            return snapshot;
        });
    }

    @Override
    public void save(CodeEvidenceStore.Snapshot snapshot) {
        transaction.executeWithoutResult(status -> insert(snapshot));
    }

    @Override
    public CodeEvidenceStore.TaskSnapshot planningTask(TaskRef ref, CodeTaskBinding binding) {
        return transaction.execute(tx -> {
            binding.lock(ref);
            return binding.planningLocked(ref);
        });
    }

    private void insert(CodeEvidenceStore.Snapshot snapshot) {
        var task = snapshot.taskSnapshot();
        jdbc.update("""
                INSERT INTO eap.code_generation
                (id, principal, conversation_id, workspace, target_path, base_hash, source_content,
                 prototype_version_id, prototype_content_hash, captured_at, task_project_id, task_id, task_revision, task_snapshot,companion_sources)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb,?::jsonb)
                """, snapshot.id(), snapshot.principal(), snapshot.conversationId(), snapshot.workspace(),
                snapshot.targetPath(), snapshot.baseHash(), snapshot.source(), snapshot.prototypeVersionId(),
                snapshot.prototypeContentHash(), Timestamp.from(snapshot.capturedAt()), task == null ? null : task.projectId(),
                task == null ? null : task.taskId(), task == null ? null : task.revision(), task == null ? null : JSON.writeValueAsString(task),
                JSON.writeValueAsString(snapshot.companionSources()));
    }

    @Override
    public Optional<CodeEvidenceStore.Snapshot> find(UUID id) {
        return jdbc.query("SELECT * FROM eap.code_generation WHERE id=?", (rs, row) -> new CodeEvidenceStore.Snapshot(
                rs.getObject("id", UUID.class), rs.getString("principal"), rs.getObject("conversation_id", UUID.class),
                rs.getString("workspace"), rs.getString("target_path"), rs.getString("base_hash"), rs.getString("source_content"),
                rs.getString("prototype_version_id"), rs.getString("prototype_content_hash"), rs.getTimestamp("captured_at").toInstant(),
                rs.getString("task_snapshot") == null ? null : JSON.readValue(rs.getString("task_snapshot"), CodeEvidenceStore.TaskSnapshot.class),
                List.of(JSON.readValue(rs.getString("companion_sources"), CodeEvidenceStore.Source[].class))), id)
                .stream().findFirst();
    }

    /** The immutable generation reference carried by a proposal. */
    public static CodeEvidenceStore.Generation reference(CodeEvidenceStore.Snapshot snapshot) {
        return new CodeEvidenceStore.Generation(snapshot.id(), snapshot.targetPath(), snapshot.baseHash(), snapshot.capturedAt(),
                snapshot.prototypeVersionId(), snapshot.prototypeContentHash(),
                snapshot.taskSnapshot() == null ? null : snapshot.taskSnapshot().binding(),
                snapshot.companionSources().stream().map(source -> new CodeEvidenceStore.Baseline(source.path(), source.baseHash())).toList());
    }
}
