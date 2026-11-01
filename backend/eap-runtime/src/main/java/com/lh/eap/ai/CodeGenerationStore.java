package com.lh.eap.ai;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/** Immutable generation evidence, not durable proposals or apply authorization (PB03). */
public interface CodeGenerationStore {
    record Snapshot(UUID id, String principal, UUID conversationId, String workspace, String targetPath,
                    String baseHash, String source, String prototypeVersionId, String prototypeContentHash,
                    Instant capturedAt) {
        public CodeChangeService.Generation reference() {
            return new CodeChangeService.Generation(id, targetPath, baseHash, capturedAt, prototypeVersionId, prototypeContentHash);
        }
        public CodeChangeService.SourceExcerpt sourceContext() {
            return new CodeChangeService.SourceExcerpt(targetPath, source != null, baseHash,
                    source == null ? 0 : source.getBytes(java.nio.charset.StandardCharsets.UTF_8).length,
                    source == null ? "" : source, "");
        }
    }
    void save(Snapshot snapshot);
    Optional<Snapshot> find(UUID id);
}
