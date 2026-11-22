package com.lh.eap.core;

import com.lh.eap.domain.model.BoardTaskColumn;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Durable board task storage and bounded active-state queries. */
public interface BoardTaskStore {
    record TaskRow(UUID id, String projectId, String title, String column, String notes,
                   String sessionId, long revision, List<String> events, String priority,
                   String goal, String acceptanceCriteria, boolean executionActive, UUID prototypeVersionId) {
        public TaskRow { BoardTaskColumn.fromWire(column); }
    }

    List<TaskRow> list(String projectId);

    Optional<TaskRow> find(UUID id, String projectId, boolean lock);

    Optional<TaskRow> findByRequest(String projectId, UUID requestId);

    void insert(UUID id, String projectId, String title, String sessionId, String column, String goal,
                String acceptanceCriteria, UUID requestId, String fingerprint, UUID prototypeId);

    String findFingerprint(String projectId, UUID requestId);

    void update(UUID id, String projectId, String column, String notes, String priority,
                String goal, String acceptanceCriteria, List<String> events);

    boolean transition(UUID id, long revision, String target, List<String> events);

    boolean hasActiveExecution(UUID id);

    boolean hasActiveWorkspace(String workspace);

    boolean hasActiveVerification(String workspace);
}
