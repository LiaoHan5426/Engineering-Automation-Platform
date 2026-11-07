package com.lh.eap.ai;

import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.ai.dto.ChatExecutionSnapshot;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Process-local execution event log. Not durable across restarts. */
@Component
public class ChatExecutionJournal {
    public static final int MAX_EXECUTIONS = 64;
    public static final int MAX_EVENTS = 512;

    private final Map<UUID, ExecutionLog> logs = new ConcurrentHashMap<>();

    public Emitter open(UUID executionId, UUID conversationId) {
        synchronized (logs) {
            while (logs.size() >= MAX_EXECUTIONS) {
                var oldest = logs.entrySet().stream()
                        .min(Map.Entry.comparingByValue((a, b) -> a.opened.compareTo(b.opened)))
                        .map(Map.Entry::getKey)
                        .orElse(null);
                if (oldest == null) break;
                logs.remove(oldest);
            }
            var log = new ExecutionLog(executionId, conversationId);
            logs.put(executionId, log);
            return new Emitter(log);
        }
    }

    public void recordRefusal(UUID conversationId, UUID executionId, String status) {
        var log = logs.get(executionId);
        if (log == null || !log.conversationId.equals(conversationId)) return;
        synchronized (log) {
            log.status = status;
            log.complete = true;
        }
    }

    public ChatExecutionSnapshot snapshot(UUID conversationId, UUID executionId, long afterSequence) {
        var log = logs.get(executionId);
        if (log == null || !log.conversationId.equals(conversationId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_EXECUTION");
        if (afterSequence < 0 || afterSequence > log.latestSequence)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CURSOR_INVALID");
        List<ChatExecutionEvent> events;
        synchronized (log) {
            events = log.events.stream().filter(event -> event.sequence() > afterSequence).toList();
            return new ChatExecutionSnapshot(
                    executionId, conversationId, log.latestSequence, log.complete, log.status, events);
        }
    }

    public final class Emitter {
        private final ExecutionLog log;
        private Consumer<ChatExecutionEvent> live = event -> {};

        Emitter(ExecutionLog log) {
            this.log = log;
        }

        public void onEvent(Consumer<ChatExecutionEvent> live) {
            this.live = live == null ? event -> {} : live;
        }

        public synchronized ChatExecutionEvent emit(
                String type, String text, String code, String status, Object payload) {
            if (log.complete) throw new IllegalStateException("Execution already complete");
            if (log.events.size() >= MAX_EVENTS)
                throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "EXECUTION_EVENT_LIMIT");
            long sequence = log.latestSequence + 1;
            var event = ChatExecutionEvent.of(
                    sequence, log.executionId, log.conversationId, null, type, text, code, status, payload);
            log.events.add(event);
            log.latestSequence = sequence;
            if (status != null && !status.isBlank()) log.status = status;
            live.accept(event);
            return event;
        }

        public synchronized void complete(String status) {
            if (!log.complete) {
                log.complete = true;
                if (status != null && !status.isBlank()) log.status = status;
            }
        }

        public UUID executionId() {
            return log.executionId;
        }
    }

    private static final class ExecutionLog {
        private final UUID executionId;
        private final UUID conversationId;
        private final java.time.Instant opened = java.time.Instant.now();
        private final List<ChatExecutionEvent> events = new ArrayList<>();
        private long latestSequence;
        private boolean complete;
        private String status = "RUNNING";

        ExecutionLog(UUID executionId, UUID conversationId) {
            this.executionId = executionId;
            this.conversationId = conversationId;
        }
    }
}
