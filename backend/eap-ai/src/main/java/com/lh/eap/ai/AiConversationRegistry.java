package com.lh.eap.ai;

import org.springframework.ai.chat.client.ChatClient;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** In-memory chat sessions. Not a recoverable mission and not a durable transcript. */
@Component
public class AiConversationRegistry {
    public static final int MAX_CONVERSATIONS = 32;
    public static final Duration IDLE = Duration.ofMinutes(30);
    public static final String PRINCIPAL = com.lh.eap.config.RuntimeWorkspace.OPERATOR_LABEL;
    public static final String MEMORY_NOTE =
            "展示历史≠模型窗口≠任务工作记忆≠绑定；模型窗口重启不可恢复；本地工作记忆可按会话ID落盘恢复；敏感清空/换模/换任务/换知识·Skill 依赖会使派生工作记忆失效；sticky 清空保护仍保留。";

    private final ChatMemory memory;
    private final Supplier<Instant> clock;
    private final WorkingMemoryStore workingMemoryStore;
    private final Map<UUID, Session> sessions = new ConcurrentHashMap<>();
    private final Object lock = new Object();

    @Autowired
    public AiConversationRegistry(ChatMemory memory, WorkingMemoryStore workingMemoryStore) {
        this(memory, Instant::now, workingMemoryStore);
    }

    public AiConversationRegistry(ChatMemory memory) {
        this(memory, Instant::now, null);
    }

    public AiConversationRegistry(ChatMemory memory, Supplier<Instant> clock) {
        this(memory, clock, null);
    }

    public AiConversationRegistry(ChatMemory memory, Supplier<Instant> clock, WorkingMemoryStore workingMemoryStore) {
        this.memory = memory;
        this.clock = clock;
        this.workingMemoryStore = workingMemoryStore;
    }

    public Session open(Path workspace, String workspaceLabel) {
        synchronized (lock) {
            sweep();
            if (sessions.size() >= MAX_CONVERSATIONS && !evictOldestIdle())
                throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_LIMIT");
            var session = new Session(UUID.randomUUID(), workspace, workspaceLabel, clock.get());
            sessions.put(session.id, session);
            return session;
        }
    }

    /** Atomic same-ID recovery and response snapshot. Existing live state is never rebound or touched. */
    public com.lh.eap.ai.dto.AiConversationReconnectResponse reconnect(UUID id, Path workspace, String workspaceLabel) {
        synchronized (lock) {
            var session = sessions.get(id);
            if (session != null) {
                if (!session.workspace.equals(workspace))
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "WORKSPACE_MISMATCH");
                if (session.busy)
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_BUSY");
                if (Duration.between(session.touched, clock.get()).compareTo(IDLE) > 0) session = null;
            }
            boolean reset = session == null;
            if (reset) {
                sweep();
                var victim = sessions.size() >= MAX_CONVERSATIONS ? oldestIdle() : java.util.Optional.<Session>empty();
                if (sessions.size() >= MAX_CONVERSATIONS && victim.isEmpty())
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_LIMIT");
                // Clear orphan memory before publishing a replacement, including after a failed clear.
                memory.clear(EngineeringChatService.memoryKey(PRINCIPAL, id));
                victim.ifPresent(old -> drop(old.id));
                session = new Session(id, workspace, workspaceLabel, clock.get());
                sessions.put(id, session);
                restoreWorkingMemory(session);
                // Model ChatMemory stays empty after reset; UI history is not replayed here.
            }
            var bound = session.binding;
            return new com.lh.eap.ai.dto.AiConversationReconnectResponse(id, session.workspaceLabel, MEMORY_NOTE,
                    bound == null ? null : bound.connectionId, bound == null ? null : bound.name,
                    bound == null ? null : bound.revision, bound == null ? null : bound.model, reset);
        }
    }

    public Binding binding(UUID id) {
        synchronized (lock) {
            return require(id).binding;
        }
    }

    public void bind(UUID id, Binding binding, boolean clearMemory) {
        synchronized (lock) {
            var session = require(id);
            if (session.busy) throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_BUSY");
            session.binding = binding;
            session.touched = clock.get();
            if (clearMemory) {
                memory.clear(EngineeringChatService.memoryKey(PRINCIPAL, id));
                session.workingMemory.invalidate("MODEL_OR_BINDING_SWITCH", clock.get());
                persistWorkingMemory(session);
            }
        }
    }

    public TaskWorkingMemory.Snapshot workingMemory(UUID id) {
        synchronized (lock) {
            return require(id).workingMemory.snapshot();
        }
    }

    /** Replace task working memory. Does not write ChatMemory or UI transcripts. */
    public TaskWorkingMemory.Snapshot putWorkingMemory(UUID id, String goal, java.util.List<String> constraints,
            java.util.List<TaskWorkingMemory.FactRef> facts, java.util.List<String> evidenceRefs,
            java.util.Set<String> dependencyKeys) {
        synchronized (lock) {
            var session = require(id);
            if (session.busy) throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_BUSY");
            session.workingMemory.replace(goal, constraints, facts, evidenceRefs, dependencyKeys, clock.get());
            session.touched = clock.get();
            persistWorkingMemory(session);
            return session.workingMemory.snapshot();
        }
    }

    public Session require(UUID id) {
        synchronized (lock) {
            sweep();
            var session = sessions.get(id);
            if (session == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_CONVERSATION");
            return session;
        }
    }

    public <T> T exclusive(UUID id, Supplier<T> action) {
        synchronized (lock) {
            var session = require(id);
            if (session.busy) throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_BUSY");
            session.busy = true;
            session.cancelRequested = false;
            session.worker = Thread.currentThread();
            session.activeExecutionId = null;
            session.touched = clock.get();
        }
        try {
            return action.get();
        } finally {
            synchronized (lock) {
                var session = sessions.get(id);
                if (session != null) {
                    session.busy = false;
                    session.cancelRequested = false;
                    session.worker = null;
                    session.activeExecutionId = null;
                    session.touched = clock.get();
                }
            }
        }
    }

    /** Request cooperative cancel of the in-flight exclusive turn. Idle conversations are a no-op success. */
    public boolean cancel(UUID id) {
        synchronized (lock) {
            var session = sessions.get(id);
            if (session == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_CONVERSATION");
            if (!session.busy) return false;
            session.cancelRequested = true;
            if (session.worker != null) session.worker.interrupt();
            session.touched = clock.get();
            return true;
        }
    }

    public boolean cancelRequested(UUID id) {
        synchronized (lock) {
            var session = sessions.get(id);
            return session != null && session.cancelRequested;
        }
    }

    public void bindExecution(UUID id, UUID executionId) {
        synchronized (lock) {
            var session = require(id);
            if (!session.busy) throw new IllegalStateException("Execution bind requires exclusive turn");
            session.activeExecutionId = executionId;
        }
    }

    /**
     * Under exclusive turn: associate Task/Run with working memory (dependencyKeys + evidenceRefs).
     * A different {@code task:} dependency invalidates prior content then rebinds. Does not copy board state machines.
     */
    public TaskWorkingMemory.Snapshot linkTaskAndExecution(UUID id, TaskContext.TaskRef taskRef, UUID executionId) {
        synchronized (lock) {
            var session = require(id);
            if (!session.busy) throw new IllegalStateException("Task/Run link requires exclusive turn");
            if (taskRef == null || executionId == null) {
                throw new IllegalArgumentException("taskRef and executionId required");
            }
            String taskKey = TaskWorkingMemory.dependencyTask(
                    taskRef.projectId(), taskRef.taskId().toString(), taskRef.revision());
            var current = session.workingMemory.snapshot();
            boolean conflict = current.dependencyKeys().stream()
                    .anyMatch(key -> key.startsWith("task:") && !key.equals(taskKey));
            if (conflict) {
                session.workingMemory.invalidate("TASK_BINDING_CHANGED", clock.get());
                current = session.workingMemory.snapshot();
            }
            var deps = new java.util.LinkedHashSet<>(current.dependencyKeys());
            deps.add(taskKey);
            var evidence = new java.util.ArrayList<>(current.evidenceRefs());
            String execRef = TaskWorkingMemory.evidenceExecution(executionId);
            if (!evidence.contains(execRef)) evidence.add(execRef);
            boolean wiped = !current.invalidation().isBlank();
            session.workingMemory.replace(
                    wiped ? "" : current.goal(),
                    wiped ? java.util.List.of() : current.constraints(),
                    wiped ? java.util.List.of() : current.facts(),
                    evidence,
                    deps,
                    clock.get());
            session.touched = clock.get();
            persistWorkingMemory(session);
            return session.workingMemory.snapshot();
        }
    }

    /**
     * Under exclusive turn: sync {@code knowledge:}/{@code skill:} dependency keys.
     * A stale key of those prefixes triggers {@code DEPENDENCY_CHANGED} then rebinds.
     * Does not cancel sticky ChatMemory clear protection.
     */
    public TaskWorkingMemory.Snapshot syncMaterialDependencies(UUID id, java.util.Set<String> materialKeys) {
        synchronized (lock) {
            var session = require(id);
            if (!session.busy) throw new IllegalStateException("Material dependency sync requires exclusive turn");
            var wanted = java.util.Set.copyOf(materialKeys == null ? java.util.Set.of() : materialKeys);
            for (var key : wanted) {
                if (key == null || !(key.startsWith("knowledge:") || key.startsWith("skill:"))) {
                    throw new IllegalArgumentException("MATERIAL_DEPENDENCY_KEY");
                }
            }
            var current = session.workingMemory.snapshot();
            boolean conflict = current.dependencyKeys().stream()
                    .anyMatch(key -> (key.startsWith("knowledge:") || key.startsWith("skill:")) && !wanted.contains(key));
            if (conflict) {
                session.workingMemory.invalidate("DEPENDENCY_CHANGED", clock.get());
                current = session.workingMemory.snapshot();
            }
            var deps = new java.util.LinkedHashSet<>(current.dependencyKeys());
            deps.addAll(wanted);
            var evidence = new java.util.ArrayList<>(current.evidenceRefs());
            boolean wiped = !current.invalidation().isBlank();
            session.workingMemory.replace(
                    wiped ? "" : current.goal(),
                    wiped ? java.util.List.of() : current.constraints(),
                    wiped ? java.util.List.of() : current.facts(),
                    evidence,
                    deps,
                    clock.get());
            session.touched = clock.get();
            persistWorkingMemory(session);
            return session.workingMemory.snapshot();
        }
    }

    public UUID activeExecutionId(UUID id) {
        synchronized (lock) {
            var session = sessions.get(id);
            return session == null ? null : session.activeExecutionId;
        }
    }

    /** Compatibility name for the unified sensitive-context memory guard. */
    boolean clearKnowledgeMemory(UUID id, boolean selected) { return clearContextMemory(id, selected); }

    /** Called only under exclusive(). Knowledge/Skill material and derived answers stay sticky-sensitive:
     * every later turn clears memory before parsing, including removals and refused requests. */
    boolean clearContextMemory(UUID id, boolean selected) {
        synchronized (lock) {
            var session = require(id);
            if (!session.busy) throw new IllegalStateException("Context memory requires exclusive turn");
            session.contextSensitive |= selected;
            if (!session.contextSensitive) return false;
            memory.clear(EngineeringChatService.memoryKey(PRINCIPAL, id));
            // Keep sticky clear protection; derived working-memory facts cannot outlive cleared model window.
            session.workingMemory.invalidate("DERIVED_CONTEXT_CLEARED", clock.get());
            persistWorkingMemory(session);
            return true;
        }
    }

    public void delete(UUID id) {
        synchronized (lock) {
            var session = sessions.get(id);
            if (session == null) {
                if (workingMemoryStore != null) workingMemoryStore.delete(id);
                return;
            }
            if (session.busy) throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_BUSY");
            drop(id, true);
        }
    }

    private void sweep() {
        Instant now = clock.get();
        var expired = sessions.values().stream()
                .filter(session -> !session.busy && Duration.between(session.touched, now).compareTo(IDLE) > 0)
                .map(session -> session.id).toList();
        for (var id : expired) drop(id);
    }

    private boolean evictOldestIdle() {
        var oldest = oldestIdle();
        oldest.ifPresent(session -> drop(session.id));
        return oldest.isPresent();
    }

    private java.util.Optional<Session> oldestIdle() {
        return sessions.values().stream().filter(session -> !session.busy)
                .min(Comparator.comparing(session -> session.touched));
    }

    private void drop(UUID id) {
        drop(id, false);
    }

    private void drop(UUID id, boolean purgeWorkingMemoryStore) {
        var removed = sessions.remove(id);
        if (removed != null) memory.clear(EngineeringChatService.memoryKey(PRINCIPAL, id));
        if (purgeWorkingMemoryStore && workingMemoryStore != null) workingMemoryStore.delete(id);
    }

    private void restoreWorkingMemory(Session session) {
        if (workingMemoryStore == null) return;
        workingMemoryStore.load(session.id).ifPresent(snapshot -> {
            if (!snapshot.invalidation().isBlank()) {
                session.workingMemory.invalidate(snapshot.invalidation(), snapshot.updatedAt());
            } else {
                session.workingMemory.replace(snapshot.goal(), snapshot.constraints(), snapshot.facts(),
                        snapshot.evidenceRefs(), snapshot.dependencyKeys(), snapshot.updatedAt());
            }
        });
    }

    private void persistWorkingMemory(Session session) {
        if (workingMemoryStore == null) return;
        workingMemoryStore.save(session.id, session.workingMemory.snapshot());
    }

    public static final class Session {
        public final UUID id;
        public final Path workspace;
        public final String workspaceLabel;
        private Instant touched;
        private boolean busy;
        private boolean cancelRequested;
        private Thread worker;
        private UUID activeExecutionId;
        private Binding binding;
        private boolean contextSensitive;
        private final TaskWorkingMemory.State workingMemory = TaskWorkingMemory.State.empty();

        Session(UUID id, Path workspace, String workspaceLabel, Instant touched) {
            this.id = id;
            this.workspace = workspace;
            this.workspaceLabel = workspaceLabel;
            this.touched = touched;
        }
    }

    public static final class Binding {
        public final UUID connectionId;
        public final long revision;
        public final String name;
        public final String model;
        public final String endpoint;
        public final String configurationRevision;
        public final ChatClient client;

        public Binding(UUID connectionId, long revision, String name, String model, String endpoint,
                String configurationRevision, ChatClient client) {
            this.connectionId = connectionId;
            this.revision = revision;
            this.name = name;
            this.model = model;
            this.endpoint = endpoint;
            this.configurationRevision = configurationRevision;
            this.client = client;
        }
    }
}
