package com.lh.eap.core;

import com.lh.eap.api.Observation;
import com.lh.eap.domain.model.ExpertManifest;
import java.util.*;
import java.util.function.Function;

/** Product persistence/authorization boundary. Each operation owns a short transaction, never a model call. */
public interface ExpertAgentAccess {
    record Snapshot(ExpertManifest manifest, long revision) { }
    Snapshot load(String expertId);
    void check(Snapshot snapshot);
    /** Revalidate the grants behind already captured evidence before reuse, including after restart. */
    default void checkEvidence(Snapshot snapshot, Set<UUID> knowledge, Set<UUID> databases) {
        check(snapshot);
        if (!knowledge.isEmpty() || !databases.isEmpty()) throw new IllegalStateException("Evidence grant validation required");
    }
    /** Recheck revision, enabled state and grants while holding the expert lock through local evidence reads. */
    <T> T authorized(Snapshot snapshot, Function<List<UUID>, T> localRead);
    /** Claim an execution id once in the existing task store. Replays must be rejected before calling a model. */
    void begin(UUID executionId, Snapshot snapshot, String goal);
    void finish(UUID executionId, String status, String modelEnhancement, List<Observation> observations);
}
