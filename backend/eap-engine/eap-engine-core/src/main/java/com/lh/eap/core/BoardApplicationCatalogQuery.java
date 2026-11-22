package com.lh.eap.core;

import com.lh.eap.api.TaskRef;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Bounded read-only discovery of durable frontend application evidence. */
public interface BoardApplicationCatalogQuery {
    record Item(UUID conversationId, UUID proposalId, UUID generationId, String targetPath,
                String afterHash, Instant appliedAt, List<String> paths) {}

    record Page(TaskRef taskBinding, String workspacePath, List<Item> items, boolean truncated) {}

    /**
     * List up to 21 bounded application rows for the exact task/workspace/operator binding.
     * A 21st row is returned only as the truncation marker and is not part of {@link Page#items()}.
     */
    Page list(TaskRef task, String workspace, String principal);
}
