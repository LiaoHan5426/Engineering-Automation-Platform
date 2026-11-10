package com.lh.eap.delivery;
import com.lh.eap.api.TaskRef;
import com.lh.eap.application.service.PrototypeVersion;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import com.lh.eap.delivery.CodeChangeService;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Immutable generation evidence, not durable proposals or apply authorization (PB03). */
public interface CodeGenerationStore {
    record Snapshot(UUID id, String principal, UUID conversationId, String workspace, String targetPath,
                    String baseHash, String source, String prototypeVersionId, String prototypeContentHash,
                    Instant capturedAt, TaskSnapshot taskSnapshot, List<ComponentGraph.Source> companionSources) {
        public Snapshot { companionSources=List.copyOf(companionSources); }
        public Snapshot(UUID id, String principal, UUID conversationId, String workspace, String targetPath,
                        String baseHash,String source,String prototypeVersionId,String prototypeContentHash,Instant capturedAt,TaskSnapshot taskSnapshot) {
            this(id,principal,conversationId,workspace,targetPath,baseHash,source,prototypeVersionId,prototypeContentHash,capturedAt,taskSnapshot,List.of());
        }
        public List<ComponentGraph.Source> sources() {
            var sources=new ArrayList<ComponentGraph.Source>();sources.add(new ComponentGraph.Source(targetPath,baseHash,source));sources.addAll(companionSources);return List.copyOf(sources);
        }
        public Snapshot(UUID id, String principal, UUID conversationId, String workspace, String targetPath,
                        String baseHash, String source, String prototypeVersionId, String prototypeContentHash, Instant capturedAt) {
            this(id, principal, conversationId, workspace, targetPath, baseHash, source, prototypeVersionId, prototypeContentHash, capturedAt, null);
        }
        public CodeChangeService.Generation reference() {
            return new CodeChangeService.Generation(id, targetPath, baseHash, capturedAt, prototypeVersionId, prototypeContentHash,
                    taskSnapshot == null ? null : taskSnapshot.binding(),companionSources.stream().map(file->new ComponentGraph.Baseline(file.path(),file.baseHash())).toList());
        }
        public CodeChangeService.SourceExcerpt sourceContext() {
            return new CodeChangeService.SourceExcerpt(targetPath, source != null, baseHash,
                    source == null ? 0 : source.getBytes(StandardCharsets.UTF_8).length,
                    source == null ? "" : source, "");
        }
    }
    record TaskSnapshot(String projectId, UUID taskId, long revision, String title, String goal,
                        String acceptanceCriteria, PrototypeVersion prototype) {
        public TaskRef binding() { return new TaskRef(projectId, taskId, revision); }
    }
    /** The callback reads source inside the same task/workspace transaction that inserts the row. */
    default Snapshot capture(TaskRef ref, String workspace, String prototypeId,
                             Function<TaskSnapshot, Snapshot> capture) {
        if (ref != null) throw new IllegalStateException("Task binding requires persistent store");
        var snapshot = capture.apply(null); save(snapshot); return snapshot;
    }
    void save(Snapshot snapshot);
    Optional<Snapshot> find(UUID id);
}
