package com.lh.eap.application.service;

import com.lh.eap.api.TaskRef;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.BoardApplicationCatalogQuery;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Bounded, read-only discovery. Selection does not bypass delivery's source/time/snapshot checks. */
public final class BoardApplicationCatalog {
    public record Item(UUID conversationId, UUID proposalId, UUID generationId, String targetPath,
                String afterHash, Instant appliedAt, List<String> paths) {}
    public record Page(TaskRef taskBinding, String workspacePath, List<Item> items, boolean truncated) {}
    private final BoardApplicationCatalogQuery query;

    public BoardApplicationCatalog(BoardApplicationCatalogQuery query) { this.query = query; }

    public Page list(TaskRef task, String workspace) {
        var stored = query.list(task, workspace, RuntimeWorkspace.OPERATOR_LABEL);
        var items = stored.items().stream()
                .map(item -> new Item(item.conversationId(), item.proposalId(), item.generationId(),
                        item.targetPath(), item.afterHash(), item.appliedAt(), item.paths()))
                .toList();
        return new Page(stored.taskBinding(), stored.workspacePath(), items, stored.truncated());
    }
}
