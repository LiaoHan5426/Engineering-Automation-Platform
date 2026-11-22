package com.lh.eap.ai;
import java.time.Instant;
import com.lh.eap.error.ProtocolErrors;
import com.lh.eap.error.ExecutionErrors;

import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.ai.dto.ChatExecutionSnapshot;
import com.lh.eap.ai.execution.ChatExecutionStore;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.domain.model.ChatExecutionStatus;

/**
 * Chat execution event journal. The hot path stays process-local; when a
 * {@link ChatExecutionStore} is wired, events are also durably appended so a restarted process
 * can replay them read-only via {@link #snapshot}. Persistence is best-effort: a store failure is
 * logged and never aborts the running turn or its SSE terminal frame (mirroring the rule that a
 * disconnected observer must not abort execution).
 *
 * <p>The log is evidence, not a takeover mechanism: a restarted, unfinished execution is replayed
 * as UNKNOWN and is never resumed or fabricated as terminal.
 */
@Component
public class ChatExecutionJournal {
    private static final Logger log = LoggerFactory.getLogger(ChatExecutionJournal.class);
    public static final int MAX_EXECUTIONS = 64;
    public static final int MAX_EVENTS = 512;

    private final Map<UUID, ExecutionLog> logs = new ConcurrentHashMap<>();

    /** Optional durable evidence store; absent in unit tests and minimal compositions. */
    @Autowired(required = false)
    private ChatExecutionStore store;

    public ChatExecutionJournal() {}

    public ChatExecutionJournal(ChatExecutionStore store) {
        this.store = store;
    }

    public Emitter open(UUID executionId, UUID conversationId) {
        synchronized (logs) {
            while (logs.size() >= MAX_EXECUTIONS) {
                var oldest = logs.entrySet().stream()
                        .filter(entry -> entry.getValue().isComplete())
                        .min(Map.Entry.comparingByValue((a, b) -> a.opened.compareTo(b.opened)))
                        .map(Map.Entry::getKey)
                        .orElse(null);
                if (oldest == null) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, ExecutionErrors.EXECUTION_CAPACITY.code());
                logs.remove(oldest);
            }
            var logEntry = new ExecutionLog(executionId, conversationId);
            logs.put(executionId, logEntry);
            persist(() -> store.open(executionId, conversationId, ChatExecutionStatus.RUNNING.wire(), Instant.now()));
            return new Emitter(logEntry);
        }
    }

    public void recordRefusal(UUID conversationId, UUID executionId, String status) {
        var logEntry = logs.get(executionId);
        if (logEntry == null || !logEntry.conversationId.equals(conversationId)) return;
        synchronized (logEntry) {
            logEntry.status = status;
            logEntry.complete = true;
        }
        persist(() -> store.finish(executionId, status, true, Instant.now()));
    }

    public ChatExecutionSnapshot snapshot(UUID conversationId, UUID executionId, long afterSequence) {
        if (afterSequence < 0)
            throw new ResponseStatusException(HttpStatus.CONFLICT, ProtocolErrors.CURSOR_INVALID.code());

        var local = logs.get(executionId);
        if (local != null && local.conversationId.equals(conversationId)) {
            List<ChatExecutionEvent> events;
            synchronized (local) {
                if (afterSequence > local.latestSequence)
                    throw new ResponseStatusException(HttpStatus.CONFLICT, ProtocolErrors.CURSOR_INVALID.code());
                events = local.events.stream().filter(event -> event.sequence() > afterSequence).toList();
                return new ChatExecutionSnapshot(
                        executionId, conversationId, local.latestSequence, local.complete, local.status, events);
            }
        }

        // Not in memory (restarted process or evicted log): replay from durable evidence only.
        if (store == null)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ExecutionErrors.UNKNOWN_EXECUTION.code());
        ChatExecutionSnapshot replay;
        try {
            replay = store.read(conversationId, executionId, afterSequence).orElse(null);
        } catch (RuntimeException failure) {
            log.warn("Execution snapshot replay failed for {}", executionId, failure);
            replay = null;
        }
        if (replay == null)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, ExecutionErrors.UNKNOWN_EXECUTION.code());
        if (afterSequence > replay.latestSequence())
            throw new ResponseStatusException(HttpStatus.CONFLICT, ProtocolErrors.CURSOR_INVALID.code());
        return replay;
    }

    public final class Emitter {
        private final ExecutionLog logEntry;
        private volatile Consumer<ChatExecutionEvent> live = event -> {};

        Emitter(ExecutionLog logEntry) {
            this.logEntry = logEntry;
        }

        public void onEvent(Consumer<ChatExecutionEvent> live) {
            this.live = live == null ? event -> {} : live;
        }

        public ChatExecutionEvent emit(
                String type, String text, String code, String status, Object payload) {
            final ChatExecutionEvent event;
            synchronized (logEntry) {
                if (logEntry.complete) throw new IllegalStateException("Execution already complete");
                // Reserve one slot for a terminal frame, including failures at the budget boundary.
                int limit = "final".equals(type) ? MAX_EVENTS : MAX_EVENTS - 1;
                if (logEntry.events.size() >= limit)
                    throw new ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, ExecutionErrors.EXECUTION_EVENT_LIMIT.code());
                long sequence = logEntry.latestSequence + 1;
                event = ChatExecutionEvent.of(sequence, logEntry.executionId, logEntry.conversationId,
                        null, type, text, code, status, payload);
                logEntry.events.add(event);
                logEntry.latestSequence = sequence;
                if (status != null && !status.isBlank()) logEntry.status = status;
                if ("final".equals(type)) logEntry.complete = true;
            }
            persist(() -> store.appendEvent(event));
            if ("final".equals(type))
                persist(() -> store.finish(logEntry.executionId, logEntry.status, true, Instant.now()));
            // A disconnected observer must not abort execution or prevent its terminal record.
            try { live.accept(event); }
            catch (RuntimeException disconnected) { live = ignored -> {}; }
            return event;
        }

        public void complete(String status) {
            synchronized (logEntry) {
                if (!logEntry.complete) {
                    logEntry.complete = true;
                    if (status != null && !status.isBlank()) logEntry.status = status;
                }
            }
            persist(() -> store.finish(logEntry.executionId, logEntry.status, true, Instant.now()));
        }

        public void fail(String code, String status) {
            if (!logEntry.isComplete()) emit("final", "", code, status, Map.of("error", code));
        }

        public UUID executionId() {
            return logEntry.executionId;
        }
    }

    /** Best-effort persistence: a store failure is diagnostic only, never a turn failure. */
    private void persist(Runnable action) {
        if (store == null) return;
        try { action.run(); }
        catch (RuntimeException failure) { log.warn("Chat execution log persistence failed", failure); }
    }

    private static final class ExecutionLog {
        private final UUID executionId;
        private final UUID conversationId;
        private final Instant opened = Instant.now();
        private final List<ChatExecutionEvent> events = new ArrayList<>();
        private long latestSequence;
        private boolean complete;
        private String status = ChatExecutionStatus.RUNNING.wire();

        synchronized boolean isComplete() { return complete; }

        ExecutionLog(UUID executionId, UUID conversationId) {
            this.executionId = executionId;
            this.conversationId = conversationId;
        }
    }
}
