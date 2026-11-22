package com.lh.eap.application.service;

import com.lh.eap.core.BoardRuntimeQuery;
import com.lh.eap.error.BoardErrors;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/** One database snapshot of existing board state; never probes executors, dispatches or changes work. */
@Service
public class BoardRuntimeService {
    public record Activity(UUID taskId, UUID id, String kind, String status, String storedStatus) {
        public Activity { new BoardRuntimeQuery.Activity(taskId, id, kind, status, storedStatus); }
    }
    public record Snapshot(String projectId, Instant observedAt, long taskCount, long runCount,
            long activeRunCount, long unknownRunCount, long activeVerificationCount, long unknownVerificationCount,
            long activeWriteCount, long unknownWriteCount, List<Activity> items, boolean truncated) {}
    private final BoardRuntimeQuery query;

    public BoardRuntimeService(BoardRuntimeQuery query) { this.query = query; }

    public Snapshot inspect(String projectId) {
        if (projectId == null || projectId.isBlank() || projectId.length() > 120)
            throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_FIELD.code());
        var stored = query.inspect(projectId);
        var items = stored.items().stream()
                .map(item -> new Activity(item.taskId(), item.id(), item.kind(), item.status(), item.storedStatus()))
                .toList();
        return new Snapshot(stored.projectId(), stored.observedAt(), stored.taskCount(), stored.runCount(),
                stored.activeRunCount(), stored.unknownRunCount(), stored.activeVerificationCount(), stored.unknownVerificationCount(),
                stored.activeWriteCount(), stored.unknownWriteCount(), items, stored.truncated());
    }
}
