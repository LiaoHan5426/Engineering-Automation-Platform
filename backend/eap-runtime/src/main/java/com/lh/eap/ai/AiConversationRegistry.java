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
    public static final String MEMORY_NOTE = "内存窗口，重启后不可恢复，也不是任务审计。";

    private final ChatMemory memory;
    private final Supplier<Instant> clock;
    private final Map<UUID, Session> sessions = new ConcurrentHashMap<>();
    private final Object lock = new Object();

    @Autowired
    public AiConversationRegistry(ChatMemory memory) {
        this(memory, Instant::now);
    }

    public AiConversationRegistry(ChatMemory memory, Supplier<Instant> clock) {
        this.memory = memory;
        this.clock = clock;
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
            if (clearMemory) memory.clear(EngineeringChatService.memoryKey(PRINCIPAL, id));
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
            session.touched = clock.get();
        }
        try {
            return action.get();
        } finally {
            synchronized (lock) {
                var session = sessions.get(id);
                if (session != null) {
                    session.busy = false;
                    session.touched = clock.get();
                }
            }
        }
    }

    public void delete(UUID id) {
        synchronized (lock) {
            var session = sessions.get(id);
            if (session == null) return;
            if (session.busy) throw new ResponseStatusException(HttpStatus.CONFLICT, "CONVERSATION_BUSY");
            drop(id);
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
        var oldest = sessions.values().stream().filter(session -> !session.busy)
                .min(Comparator.comparing(session -> session.touched));
        oldest.ifPresent(session -> drop(session.id));
        return oldest.isPresent();
    }

    private void drop(UUID id) {
        var removed = sessions.remove(id);
        if (removed != null) memory.clear(EngineeringChatService.memoryKey(PRINCIPAL, id));
    }

    public static final class Session {
        public final UUID id;
        public final Path workspace;
        public final String workspaceLabel;
        private Instant touched;
        private boolean busy;
        private Binding binding;

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
