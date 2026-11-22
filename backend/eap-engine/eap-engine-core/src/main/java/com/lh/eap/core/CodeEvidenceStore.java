package com.lh.eap.core;

import com.lh.eap.api.TaskRef;
import com.lh.eap.domain.model.PrototypeVersion;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Shared persistence projections for code generation and proposals. Delivery/workflow models are
 * mapped to these records at the port boundary; no adapter imports an upstream implementation.
 */
public final class CodeEvidenceStore {
    private CodeEvidenceStore() { }

    public record Source(String path, String baseHash, String content) { }
    public record Baseline(String path, String baseHash) { }
    public record Change(String path, String before, String content, String baseHash) { }
    public record Check(String name, Integer exitCode, String summary) { }

    public record Generation(UUID id, String targetPath, String baseHash, Instant capturedAt,
                             String prototypeVersionId, String prototypeContentHash, TaskRef taskBinding,
                             List<Baseline> companionFiles) {
        public Generation { companionFiles = List.copyOf(companionFiles); }
    }

    public record TaskSnapshot(String projectId, UUID taskId, long revision, String title, String goal,
                               String acceptanceCriteria, String notes, PrototypeVersion prototype) {
        public TaskRef binding() { return new TaskRef(projectId, taskId, revision); }
    }

    public record Snapshot(UUID id, String principal, UUID conversationId, String workspace, String targetPath,
                           String baseHash, String source, String prototypeVersionId, String prototypeContentHash,
                           Instant capturedAt, TaskSnapshot taskSnapshot, List<Source> companionSources) {
        public Snapshot { companionSources = List.copyOf(companionSources); }
        public List<Source> sources() {
            var sources = new java.util.ArrayList<Source>();
            sources.add(new Source(targetPath, baseHash, source));
            sources.addAll(companionSources);
            return List.copyOf(sources);
        }
    }

    public record Proposal(UUID id, UUID conversationId, String workspace, String summary, List<Change> files,
                           Instant createdAt, boolean applied, boolean writeAllowed, String verification, Generation generation) { }

    public record Applied(UUID id, List<String> written, String verification, List<Check> checks,
                          String status, String afterHash, String reason) { }

    public record Stored(String principal, Proposal proposal, String status, Applied result, String reason,
                         Instant startedAt, Instant finishedAt) { }

    public enum FileMatch { BASELINE, CANDIDATE, BOTH, DIFFERENT }
    public record FileEvidence(String path, String baselineHash, String candidateHash, String currentHash, FileMatch match) { }
    public record Observation(List<FileEvidence> files, String digest) { }
    public record Resolution(UUID requestId, String operator, Instant closedAt, String note, Observation observation) { }
    public record ReviewItem(UUID id, String status, String reason, Instant startedAt) { }
    public record ReviewRow(ReviewItem item, Proposal proposal, Resolution resolution) { }
}
