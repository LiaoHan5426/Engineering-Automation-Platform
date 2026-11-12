package com.lh.eap.delivery;
import com.lh.eap.api.TaskRef;
import com.lh.eap.application.service.BoardCodeTaskBinding;
import com.lh.eap.application.service.BoardTaskService;
import com.lh.eap.application.service.WorkspaceInterlock;
import com.lh.eap.persistence.mapper.JdbcPrototypeVersionStore;
import java.util.List;
import java.util.function.Function;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import com.lh.eap.error.CodeErrors;
import com.lh.eap.delivery.CodeGenerationStore;

import java.sql.Timestamp;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Insert-only production adapter. Commit completes before a model can observe source context. */
@Repository
public class JdbcCodeGenerationStore implements CodeGenerationStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final BoardCodeTaskBinding tasks;
    public JdbcCodeGenerationStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this(jdbc, manager, new BoardCodeTaskBinding(
                new BoardTaskService(jdbc), new JdbcPrototypeVersionStore(jdbc)));
    }
    @Autowired
    public JdbcCodeGenerationStore(JdbcTemplate jdbc, PlatformTransactionManager manager, BoardCodeTaskBinding tasks) {
        this.jdbc = jdbc;
        this.tasks = tasks;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setTimeout(10);
    }
    @Override public Snapshot capture(TaskRef ref, String workspace, String prototypeId,
                                      Function<TaskSnapshot, Snapshot> capture) {
        return transaction.execute(tx -> {
            if (ref != null) {
                tasks.lock(ref);
                WorkspaceInterlock.lock(jdbc, workspace);
                if (WorkspaceInterlock.codeActive(jdbc, workspace)
                        || WorkspaceInterlock.boardActive(jdbc, workspace))
                    throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.CODE_WORKSPACE_BUSY.code());
            }
            var snapshot = capture.apply(ref == null ? null : tasks.captureLocked(ref, prototypeId));
            insert(snapshot); // Do not call REQUIRES_NEW save while holding a task lock.
            return snapshot;
        });
    }
    @Override public void save(Snapshot snapshot) {
        transaction.executeWithoutResult(status -> insert(snapshot));
    }
    @Override public TaskSnapshot planningTask(TaskRef ref) {
        return transaction.execute(tx -> {
            tasks.lock(ref);
            return tasks.planningLocked(ref);
        });
    }
    private void insert(Snapshot snapshot) {
        var task = snapshot.taskSnapshot();
        jdbc.update("""
                INSERT INTO eap.code_generation
                (id, principal, conversation_id, workspace, target_path, base_hash, source_content,
                 prototype_version_id, prototype_content_hash, captured_at, task_project_id, task_id, task_revision, task_snapshot,companion_sources)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb,?::jsonb)
                """, snapshot.id(), snapshot.principal(), snapshot.conversationId(), snapshot.workspace(),
                snapshot.targetPath(), snapshot.baseHash(), snapshot.source(), snapshot.prototypeVersionId(),
                snapshot.prototypeContentHash(), Timestamp.from(snapshot.capturedAt()), task == null ? null : task.projectId(),
                task == null ? null : task.taskId(), task == null ? null : task.revision(), task == null ? null : JSON.writeValueAsString(task),JSON.writeValueAsString(snapshot.companionSources()));
    }
    @Override public Optional<Snapshot> find(UUID id) {
        return jdbc.query("SELECT * FROM eap.code_generation WHERE id=?", (rs, row) -> new Snapshot(
                rs.getObject("id", UUID.class), rs.getString("principal"), rs.getObject("conversation_id", UUID.class),
                rs.getString("workspace"), rs.getString("target_path"), rs.getString("base_hash"), rs.getString("source_content"),
                rs.getString("prototype_version_id"), rs.getString("prototype_content_hash"), rs.getTimestamp("captured_at").toInstant(),
                rs.getString("task_snapshot") == null ? null : JSON.readValue(rs.getString("task_snapshot"), TaskSnapshot.class),
                List.of(JSON.readValue(rs.getString("companion_sources"),ComponentGraph.Source[].class))), id)
                .stream().findFirst();
    }
}
