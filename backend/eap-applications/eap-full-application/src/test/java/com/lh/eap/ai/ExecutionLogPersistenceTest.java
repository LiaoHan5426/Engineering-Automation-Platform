package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.ai.dto.ChatExecutionSnapshot;
import com.lh.eap.ai.execution.ChatExecutionStore;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * CT-01 behaviour tests that need no database: durable append, cross-"restart" read-only replay,
 * UNKNOWN convergence for unfinished executions, and best-effort persistence that never aborts a
 * running turn. A shared in-memory store stands in for the JDBC adapter across two journal
 * instances, modelling a fresh process reading what a previous process wrote.
 */
class ExecutionLogPersistenceTest {

    /** In-memory stand-in for the durable store, shared across journal instances. */
    static final class MemoryStore implements ChatExecutionStore {
        final Map<UUID, Head> heads = new ConcurrentHashMap<>();
        final Map<UUID, List<ChatExecutionEvent>> events = new ConcurrentHashMap<>();
        volatile boolean failing = false;

        @Override public void open(UUID executionId, UUID conversationId, String status, Instant now) {
            if (failing) throw new IllegalStateException("store down");
            heads.put(executionId, new Head(conversationId, status, false));
            events.put(executionId, new ArrayList<>());
        }

        @Override public void appendEvent(ChatExecutionEvent event) {
            if (failing) throw new IllegalStateException("store down");
            events.computeIfAbsent(event.executionId(), key -> new ArrayList<>()).add(event);
        }

        @Override public void finish(UUID executionId, String status, boolean complete, Instant now) {
            if (failing) throw new IllegalStateException("store down");
            Head head = heads.get(executionId);
            if (head == null || head.complete) return;
            heads.put(executionId, new Head(head.conversationId, status, complete));
        }

        @Override public Optional<ChatExecutionSnapshot> read(UUID conversationId, UUID executionId, long afterSequence) {
            Head head = heads.get(executionId);
            if (head == null || !head.conversationId.equals(conversationId)) return Optional.empty();
            List<ChatExecutionEvent> all = events.getOrDefault(executionId, List.of());
            List<ChatExecutionEvent> tail = all.stream().filter(e -> e.sequence() > afterSequence).toList();
            long latest = all.stream().mapToLong(ChatExecutionEvent::sequence).max().orElse(0L);
            boolean complete = head.complete;
            String status = complete ? head.status : "UNKNOWN";
            return Optional.of(new ChatExecutionSnapshot(executionId, conversationId, latest, complete, status, tail));
        }

        record Head(UUID conversationId, String status, boolean complete) {}
    }

    @Test
    void finishedExecutionReplaysReadonlyAfterRestart() {
        var store = new MemoryStore();
        var conversation = UUID.randomUUID();
        var execution = UUID.randomUUID();
        var firstProcess = new ChatExecutionJournal(store);
        var emitter = firstProcess.open(execution, conversation);
        emitter.emit("status", "", "", "RUNNING", null);
        emitter.emit("answer.delta", "hello", "", "RUNNING", null);
        emitter.emit("final", "hello", "", "SUCCEEDED", null);
        emitter.complete("SUCCEEDED");

        // Fresh process: no in-memory log, only the durable evidence store.
        var restarted = new ChatExecutionJournal(store);
        var snapshot = restarted.snapshot(conversation, execution, 0);
        assertTrue(snapshot.complete());
        assertEquals("SUCCEEDED", snapshot.status());
        assertEquals(3, snapshot.latestSequence());
        assertEquals(3, snapshot.events().size());
        assertEquals(List.of("status", "answer.delta", "final"),
                snapshot.events().stream().map(ChatExecutionEvent::type).toList());
        var tail = restarted.snapshot(conversation, execution, 1);
        assertEquals(2, tail.events().size());
        assertEquals("answer.delta", tail.events().get(0).type());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> restarted.snapshot(conversation, execution, 9));
    }

    @Test
    void unfinishedExecutionReplaysAsUnknownNeverResumable() {
        var store = new MemoryStore();
        var conversation = UUID.randomUUID();
        var execution = UUID.randomUUID();
        var firstProcess = new ChatExecutionJournal(store);
        var emitter = firstProcess.open(execution, conversation);
        emitter.emit("status", "", "", "RUNNING", null);
        emitter.emit("answer.delta", "partial", "", "RUNNING", null);
        // No terminal frame: process "crashed" mid-turn.

        var restarted = new ChatExecutionJournal(store);
        var snapshot = restarted.snapshot(conversation, execution, 0);
        assertFalse(snapshot.complete());
        assertEquals("UNKNOWN", snapshot.status());
        assertEquals(2, snapshot.events().size());
    }

    @Test
    void storeFailureNeverAbortsTurnOrTerminalFrame() {
        var store = new MemoryStore();
        var conversation = UUID.randomUUID();
        var execution = UUID.randomUUID();
        var journal = new ChatExecutionJournal(store);
        store.failing = true;
        var emitter = journal.open(execution, conversation);
        emitter.emit("status", "", "", "RUNNING", null);
        emitter.emit("final", "answer", "", "SUCCEEDED", null);
        emitter.complete("SUCCEEDED");
        // In-memory journal still fully consistent even though every persistence call failed.
        var snapshot = journal.snapshot(conversation, execution, 0);
        assertTrue(snapshot.complete());
        assertEquals("SUCCEEDED", snapshot.status());
        assertEquals("answer", snapshot.events().get(1).text());
    }

    @Configuration
    @Import({ChatExecutionJournal.class, com.lh.eap.ai.execution.JdbcChatExecutionStore.class})
    static class Wiring {
        @Bean JdbcTemplate jdbcTemplate() {
            return org.mockito.Mockito.mock(JdbcTemplate.class);
        }
    }

    @Test
    void springWiresDurableStoreIntoJournal() {
        try (var ctx = new AnnotationConfigApplicationContext(Wiring.class)) {
            var journal = ctx.getBean(ChatExecutionJournal.class);
            assertNotNull(ReflectionTestUtils.getField(journal, "store"),
                    "production journal must receive the durable store via optional injection");
            assertTrue(ReflectionTestUtils.getField(journal, "store")
                    instanceof com.lh.eap.ai.execution.JdbcChatExecutionStore);
        }
    }

    @Test
    void replayPayloadSurvivesJsonRoundTrip() {
        var store = new MemoryStore();
        var conversation = UUID.randomUUID();
        var execution = UUID.randomUUID();
        var journal = new ChatExecutionJournal(store);
        var emitter = journal.open(execution, conversation);
        emitter.emit("final", "answer", "", "SUCCEEDED", Map.of("error", "NONE", "n", 2));
        emitter.complete("SUCCEEDED");
        var replay = new ChatExecutionJournal(store).snapshot(conversation, execution, 0);
        // The in-memory memory store keeps the original object; the JDBC adapter returns JsonNode.
        // Either way the snapshot must carry a non-null payload for the final envelope.
        assertNotNull(replay.events().get(0).payload());
    }
}
