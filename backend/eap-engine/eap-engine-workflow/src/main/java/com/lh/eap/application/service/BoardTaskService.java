package com.lh.eap.application.service;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import com.lh.eap.core.BoardTaskStore;
import com.lh.eap.core.PrototypeVersionQuery;
import com.lh.eap.error.BoardErrors;
import com.lh.eap.error.CodeErrors;
import com.lh.eap.error.CommonErrors;
import com.lh.eap.error.ResourceErrors;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.lh.eap.common.SensitiveData;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import com.lh.eap.domain.model.BoardTaskColumn;

/** Durable preparation only: no process ownership, execution or acceptance is inferred. */
@Service
public class BoardTaskService {
    public record Task(UUID id, String projectId, String title, String column, String notes,
                       String sessionId, long revision, List<String> events, String priority,
                       String goal, String acceptanceCriteria, boolean executionActive, UUID prototypeVersionId) {
        public Task { BoardTaskColumn.fromWire(column); }
        @JsonProperty public List<String> preparationIssues() { return missing(goal, acceptanceCriteria); }
        @JsonProperty public List<String> allowedColumns() {
            if (executionActive || !Set.of(BoardTaskColumn.PLANNED.wire(), BoardTaskColumn.READY.wire()).contains(column)) return List.of();
            return preparationIssues().isEmpty() ? List.of(BoardTaskColumn.PLANNED.wire(), BoardTaskColumn.READY.wire()) : List.of(BoardTaskColumn.PLANNED.wire());
        }
    }
    public record Draft(String projectId, String title, String sessionId, String column,
                        String goal, String acceptanceCriteria, UUID requestId) {}
    public record PrototypeDraft(String projectId, String title, String goal, String acceptanceCriteria,
                                 UUID requestId, UUID versionId) {}
    public record Update(String projectId, long revision, String column, String notes, String priority,
                         String goal, String acceptanceCriteria) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final BoardTaskStore store;
    private final PrototypeVersionQuery versions;
    private final WorkspaceInterlock interlocks;

    public BoardTaskService(BoardTaskStore store, PrototypeVersionQuery versions, WorkspaceInterlock interlocks) {
        this.store = store; this.versions = versions; this.interlocks = interlocks;
    }

    public List<Task> list(String projectId) {
        require(projectId, 120);
        return store.list(projectId).stream().map(BoardTaskService::map).toList();
    }
    public Task get(UUID id, String projectId) {
        require(projectId, 120);
        return find(id, projectId, false);
    }

    @Transactional public Task create(Draft draft) {
        return create(draft, null);
    }

    /** Atomic task preparation from one immutable design; never starts code generation. */
    @Transactional public Task fromPrototype(PrototypeDraft draft) {
        if (draft == null || draft.versionId() == null) throw new IllegalArgumentException(BoardErrors.PROTOTYPE_INPUT_INVALID.code());
        var version = versions.find(draft.versionId());
        if (version == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, ResourceErrors.PROTOTYPE_VERSION_NOT_FOUND.code());
        SemanticPrototype.require(version.body());
        return create(new Draft(draft.projectId(), draft.title(), "", BoardTaskColumn.PLANNED.wire(),
                draft.goal(), draft.acceptanceCriteria(), draft.requestId()), version.id());
    }

    private Task create(Draft draft, UUID prototypeId) {
        require(draft.projectId(), 120); require(draft.title(), 200);
        if (draft.requestId() == null) throw new IllegalArgumentException(BoardErrors.BOARD_REQUEST_ID_REQUIRED.code());
        String sessionId = draft.sessionId() == null ? "" : draft.sessionId();
        if (sessionId.length() > 120) throw new IllegalArgumentException(CommonErrors.SESSION_ID_TOO_LONG.code());
        String column = draft.column() == null ? BoardTaskColumn.PLANNED.wire() : draft.column();
        if (!Set.of(BoardTaskColumn.PLANNED.wire(), BoardTaskColumn.READY.wire()).contains(column)) throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_INITIAL_COLUMN.code());
        String title = text(draft.title().trim(), 200);
        String goal = text(draft.goal(), 4000), criteria = text(draft.acceptanceCriteria(), 4000);
        requireReady(column, goal, criteria);
        // The original normalized request digest is stable across subsequent task edits.
        String fingerprint = fingerprint(List.of(draft.projectId(), title, sessionId, column, goal, criteria,
                prototypeId == null ? "" : prototypeId.toString()));
        store.insert(UUID.randomUUID(), draft.projectId(), title, sessionId, column, goal, criteria,
                draft.requestId(), fingerprint, prototypeId);
        String savedFingerprint = store.findFingerprint(draft.projectId(), draft.requestId());
        if (!fingerprint.equals(savedFingerprint)) throw conflict(BoardErrors.BOARD_REQUEST_CONFLICT.code());
        return map(store.findByRequest(draft.projectId(), draft.requestId()).orElseThrow());
    }

    @Transactional public Task update(UUID id, Update update) {
        require(update.projectId(), 120);
        if (update.revision() < 1) throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_REVISION.code());
        Task current = find(id, update.projectId(), true);
        if (current.revision() != update.revision()) throw conflict(BoardErrors.BOARD_REVISION_CONFLICT.code());
        if (hasActiveExecution(id)) throw conflict(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
        String target = update.column() == null ? current.column() : update.column();
        if (!allowed(current.column(), target)) throw conflict(BoardErrors.BOARD_EXECUTION_EVIDENCE_REQUIRED.code());
        String notes = update.notes() == null ? current.notes() : text(update.notes(), 4000);
        String goal = update.goal() == null ? current.goal() : text(update.goal(), 4000);
        String criteria = update.acceptanceCriteria() == null ? current.acceptanceCriteria() : text(update.acceptanceCriteria(), 4000);
        String priority = update.priority() == null ? current.priority() : validatePriority(update.priority());
        requireReady(target, goal, criteria);
        List<String> events = new ArrayList<>(current.events());
        if (!target.equals(current.column())) events.add(target);
        if (!notes.equals(current.notes())) events.add("notes_updated");
        if (!priority.equals(current.priority())) events.add("priority_updated");
        if (!goal.equals(current.goal()) || !criteria.equals(current.acceptanceCriteria())) events.add("preparation_updated");
        if (events.size() == current.events().size()) return current;
        store.update(id, update.projectId(), target, notes, priority, goal, criteria, events);
        return find(id, update.projectId(), false);
    }

    /** Only the evidence service may request these transitions, inside its task/workspace transaction. */
    Task deliveryTransition(Task current, String target) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("Delivery transition requires transaction");
        boolean submit = current.column().equals(BoardTaskColumn.READY.wire()) && target.equals(BoardTaskColumn.ACCEPTANCE.wire());
        boolean decide = current.column().equals(BoardTaskColumn.ACCEPTANCE.wire()) && Set.of(BoardTaskColumn.DONE.wire(), BoardTaskColumn.READY.wire()).contains(target);
        if (!submit && !decide) throw conflict(BoardErrors.BOARD_EXECUTION_EVIDENCE_REQUIRED.code());
        if (hasActiveExecution(current.id())) throw conflict(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
        var events = new ArrayList<>(current.events()); events.add(target);
        if (!store.transition(current.id(), current.revision(), target, events)) throw conflict(BoardErrors.BOARD_REVISION_CONFLICT.code());
        return find(current.id(), current.projectId(), false);
    }

    // Separate statement after locking the task: a waiter needs a fresh READ COMMITTED snapshot.
    boolean hasActiveExecution(UUID id) { return store.hasActiveExecution(id); }
    // All callers acquire the task row first, then this workspace lock: never the opposite order.
    void lockWorkspace(String workspace) {
        interlocks.lock(workspace);
        if (interlocks.codeActive(workspace)) throw conflict(CodeErrors.CODE_WORKSPACE_BUSY.code());
    }
    boolean hasActiveWorkspace(String workspace) {
        return interlocks.codeActive(workspace) || store.hasActiveWorkspace(workspace);
    }
    boolean hasActiveVerification(String workspace) {
        return interlocks.codeActive(workspace) || store.hasActiveVerification(workspace);
    }
    Task find(UUID id, String projectId, boolean lock) {
        return store.find(id, projectId, lock).map(BoardTaskService::map)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, BoardErrors.BOARD_TASK_NOT_FOUND.code()));
    }
    private static Task map(BoardTaskStore.TaskRow row) {
        return new Task(row.id(), row.projectId(), row.title(), row.column(), row.notes(), row.sessionId(),
                row.revision(), row.events(), row.priority(), row.goal(), row.acceptanceCriteria(),
                row.executionActive(), row.prototypeVersionId());
    }
    public static boolean allowed(String from, String to) {
        return Set.of(BoardTaskColumn.PLANNED.wire(), BoardTaskColumn.READY.wire()).contains(from) && Set.of(BoardTaskColumn.PLANNED.wire(), BoardTaskColumn.READY.wire()).contains(to);
    }
    public static String validatePriority(String value) {
        if (value == null || !Set.of("none", "p0", "p1", "p2").contains(value)) throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_PRIORITY.code());
        return value;
    }
    private static List<String> missing(String goal, String criteria) {
        List<String> issues = new ArrayList<>();
        if (goal.isBlank()) issues.add("goal");
        if (criteria.isBlank()) issues.add("acceptanceCriteria");
        return List.copyOf(issues);
    }
    private static void requireReady(String column, String goal, String criteria) {
        if (column.equals(BoardTaskColumn.READY.wire()) && !missing(goal, criteria).isEmpty()) throw conflict(BoardErrors.BOARD_PREPARATION_REQUIRED.code());
    }
    private static String text(String value, int limit) {
        if (value == null) return "";
        if (value.length() > limit) throw new IllegalArgumentException(BoardErrors.BOARD_TEXT_TOO_LONG.code());
        var safe = SensitiveData.redact(value);
        if (safe.length() > limit) throw new IllegalArgumentException(BoardErrors.BOARD_TEXT_TOO_LONG.code());
        return safe;
    }
    private static String fingerprint(List<String> fields) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(JSON.writeValueAsString(fields).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static ResponseStatusException conflict(String reason) { return new ResponseStatusException(HttpStatus.CONFLICT, reason); }
    private static void require(String value, int limit) { if (value == null || value.isBlank() || value.length() > limit) throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_FIELD.code()); }
}
