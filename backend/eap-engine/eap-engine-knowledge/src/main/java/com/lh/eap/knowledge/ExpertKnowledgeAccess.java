package com.lh.eap.knowledge;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** Expert authorization reads needed by knowledge consumers, independent of workflow implementation. */
public interface ExpertKnowledgeAccess {
    /** Lock the definition for the caller's short transaction; return its persisted identity/revision/manifest.
     * Implementations must participate in that transaction, not release the lock before retrieval finishes. */
    Optional<Map<String, Object>> lockForKnowledge(String expertId);
    /** Read authoritative persisted grants again on each call; never return a cached permission snapshot. */
    List<UUID> knowledgeGrants(String expertId);
}
