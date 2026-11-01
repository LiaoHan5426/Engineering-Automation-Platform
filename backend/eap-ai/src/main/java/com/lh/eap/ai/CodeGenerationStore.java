package com.lh.eap.ai;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Immutable generation evidence, not durable proposals or apply authorization (PB03). */
public interface CodeGenerationStore {
    record Snapshot(UUID id, String principal, UUID conversationId, String workspace, String targetPath,
                    String baseHash, String source, String prototypeVersionId, String prototypeContentHash,
                    Instant capturedAt, TaskSnapshot taskSnapshot) {
        public Snapshot(UUID id, String principal, UUID conversationId, String workspace, String targetPath,
                        String baseHash, String source, String prototypeVersionId, String prototypeContentHash, Instant capturedAt) {
            this(id, principal, conversationId, workspace, targetPath, baseHash, source, prototypeVersionId, prototypeContentHash, capturedAt, null);
        }
        public CodeChangeService.Generation reference() {
            return new CodeChangeService.Generation(id, targetPath, baseHash, capturedAt, prototypeVersionId, prototypeContentHash,
                    taskSnapshot == null ? null : taskSnapshot.binding());
        }
        public CodeChangeService.SourceExcerpt sourceContext() {
            return new CodeChangeService.SourceExcerpt(targetPath, source != null, baseHash,
                    source == null ? 0 : source.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                    source == null ? "" : source, "");
        }
    }
    record TaskSnapshot(String projectId, UUID taskId, long revision, String title, String goal,
                        String acceptanceCriteria, com.lh.eap.application.service.PrototypeVersion prototype) {
        public TaskContext.TaskRef binding() { return new TaskContext.TaskRef(projectId, taskId, revision); }
    }
    /** The callback reads source inside the same task/workspace transaction that inserts the row. */
    default Snapshot capture(TaskContext.TaskRef ref, String workspace, String prototypeId,
                             java.util.function.Function<TaskSnapshot, Snapshot> capture) {
        if (ref != null) throw new IllegalStateException("Task binding requires persistent store");
        var snapshot = capture.apply(null); save(snapshot); return snapshot;
    }
    void save(Snapshot snapshot);
    Optional<Snapshot> find(UUID id);
}
