package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.Message;
import org.springframework.web.server.ResponseStatusException;

class AiConversationRegistryTest {
    @TempDir Path root;
    private static final AiConversationRegistry.Binding TARGET = new AiConversationRegistry.Binding(
            UUID.randomUUID(), 1, "selected", "model", "endpoint", "revision", null);

    static final class RecordingMemory implements ChatMemory {
        final ChatMemory delegate = MessageWindowChatMemory.builder().maxMessages(20).build();
        final List<String> cleared = new ArrayList<>();
        public void add(String conversationId, List<Message> messages) { delegate.add(conversationId, messages); }
        public List<Message> get(String conversationId) { return delegate.get(conversationId); }
        public void clear(String conversationId) { cleared.add(conversationId); delegate.clear(conversationId); }
    }

    @Test void expiredForeignSessionCannotBeRecreatedInAnotherWorkspace() {
        var memory = new RecordingMemory();
        var now = new AtomicReference<>(Instant.parse("2026-10-24T00:00:00Z"));
        var registry = new AiConversationRegistry(memory, now::get);
        registry.open(root, "ws");
        now.set(now.get().plusSeconds(60));
        var live = registry.open(root, "ws");
        now.set(now.get().plusSeconds(1801));
        // Both targets are now expired: a foreign workspace must never recover the UUID.
        var mismatch = assertThrows(ResponseStatusException.class,
                () -> registry.reconnect(live.id, root.resolve("other"), "other", TARGET));
        assertEquals("WORKSPACE_MISMATCH", mismatch.getReason());
        assertTrue(memory.cleared.isEmpty());
    }

    @Test void reconnectPreservesLiveBindingMemorySensitivityAndRejectsBusyWithoutMutation() {
        var memory = new RecordingMemory();
        var registry = new AiConversationRegistry(memory);
        var session = registry.open(root, "ws");
        var binding = new AiConversationRegistry.Binding(UUID.randomUUID(), 7, "chosen", "model", "endpoint", "revision", null);
        registry.bind(session.id, binding, false);
        registry.exclusive(session.id, () -> {
            registry.clearContextMemory(session.id, true);
            return null;
        });
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, session.id);
        memory.add(key, new org.springframework.ai.chat.messages.UserMessage("retained"));
        memory.cleared.clear();
        var result = registry.reconnect(session.id, root, "ws", binding);
        assertFalse(result.contextReset());
        assertEquals(binding.connectionId, result.connectionId());
        assertEquals(7L, result.connectionRevision());
        assertEquals("model", result.model());
        assertSame(binding, registry.binding(session.id));
        assertEquals(1, memory.get(key).size());
        registry.exclusive(session.id, () -> {
            assertEquals("CONVERSATION_BUSY", assertThrows(ResponseStatusException.class,
                    () -> registry.reconnect(session.id, root, "ws", binding)).getReason());
            assertTrue(memory.cleared.isEmpty());
            assertTrue(registry.clearContextMemory(session.id, false));
            return null;
        });
        assertTrue(memory.get(key).isEmpty());
    }

    @Test void expiredReconnectUsesSameIdClearsMemoryAndBindsExplicitTarget() {
        var memory = new RecordingMemory();
        var now = new AtomicReference<>(Instant.parse("2026-10-24T00:00:00Z"));
        var registry = new AiConversationRegistry(memory, now::get);
        var session = registry.open(root, "ws");
        registry.bind(session.id, new AiConversationRegistry.Binding(UUID.randomUUID(), 1, "old", "m", "e", "r", null), false);
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, session.id);
        memory.add(key, new org.springframework.ai.chat.messages.UserMessage("expired"));
        now.set(now.get().plusSeconds(1801));
        var response = registry.reconnect(session.id, root, "ws", TARGET);
        assertTrue(response.contextReset());
        assertEquals(session.id, response.conversationId());
        assertEquals(TARGET.connectionId, response.connectionId());
        assertTrue(memory.get(key).isEmpty());
        assertNotSame(session, registry.require(session.id));
    }

    @Test void concurrentReconnectCreatesOnlyOneSessionAndClearsOnlyOnce() throws Exception {
        var memory = new RecordingMemory();
        var registry = new AiConversationRegistry(memory);
        var id = UUID.randomUUID();
        var start = new CountDownLatch(1);
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(8)) {
            var results = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 16; i++) results.add(workers.submit(() -> {
                start.await();
                return registry.reconnect(id, root, "ws", TARGET).contextReset();
            }));
            start.countDown();
            int resets = 0;
            for (var result : results) if (result.get(5, java.util.concurrent.TimeUnit.SECONDS)) resets++;
            assertEquals(1, resets);
        }
        assertEquals(1, memory.cleared.size());
        assertEquals(id, registry.require(id).id);
    }

    @Test void reconnectAtCapEvictsOnlyOldestIdleAndRejectsWhenAllBusy() {
        var memory = new RecordingMemory();
        var now = new AtomicReference<>(Instant.parse("2026-10-24T00:00:00Z"));
        var registry = new AiConversationRegistry(memory, now::get);
        var ids = new ArrayList<UUID>();
        for (int i = 0; i < AiConversationRegistry.MAX_CONVERSATIONS; i++) {
            ids.add(registry.open(root, "ws").id);
            now.set(now.get().plusSeconds(1));
        }
        var recovered = UUID.randomUUID();
        assertTrue(registry.reconnect(recovered, root, "ws", TARGET).contextReset());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> registry.require(ids.removeFirst())).getStatusCode().value());
        ids.add(recovered);
        holdAll(registry, ids, 0, () -> {
            var missing = UUID.randomUUID();
            assertEquals("CONVERSATION_LIMIT", assertThrows(ResponseStatusException.class,
                    () -> registry.reconnect(missing, root, "ws", TARGET)).getReason());
            assertEquals(404, assertThrows(ResponseStatusException.class, () -> registry.require(missing)).getStatusCode().value());
        });
    }

    private void holdAll(AiConversationRegistry registry, List<UUID> ids, int index, Runnable action) {
        if (index == ids.size()) { action.run(); return; }
        registry.exclusive(ids.get(index), () -> { holdAll(registry, ids, index + 1, action); return null; });
    }

    @Test void failedOrphanClearDoesNotPublishSessionOrEvictCapacityVictim() {
        var memory = org.mockito.Mockito.mock(ChatMemory.class);
        var registry = new AiConversationRegistry(memory);
        var ids = new ArrayList<UUID>();
        for (int i = 0; i < AiConversationRegistry.MAX_CONVERSATIONS; i++) ids.add(registry.open(root, "ws").id);
        var missing = UUID.randomUUID();
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, missing);
        org.mockito.Mockito.doThrow(new IllegalStateException("memory unavailable")).when(memory).clear(key);
        assertThrows(IllegalStateException.class, () -> registry.reconnect(missing, root, "ws", TARGET));
        for (var id : ids) assertNotNull(registry.require(id));
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> registry.require(missing)).getStatusCode().value());
        org.mockito.Mockito.doNothing().when(memory).clear(key);
        assertTrue(registry.reconnect(missing, root, "ws", TARGET).contextReset());
    }

    @Test void liveReconnectDoesNotSweepUnrelatedExpiredSessionsAndRenewsItsLifetime() {
        var memory = new RecordingMemory();
        var now = new AtomicReference<>(Instant.parse("2026-10-24T00:00:00Z"));
        var registry = new AiConversationRegistry(memory, now::get);
        registry.open(root, "ws");
        now.set(now.get().plusSeconds(60));
        var live = registry.open(root, "ws");
        now.set(now.get().plusSeconds(1741));
        assertFalse(registry.reconnect(live.id, root, "ws", TARGET).contextReset());
        assertTrue(memory.cleared.isEmpty());
        now.set(now.get().plusSeconds(1801));
        assertTrue(registry.reconnect(live.id, root, "ws", TARGET).contextReset());
    }

    @Test void deletionClearsOnlyItsMemoryAndRejectsBusySessions() {
        var memory = new RecordingMemory();
        var registry = new AiConversationRegistry(memory);
        var first = registry.open(root, "ws").id;
        var other = registry.open(root, "ws").id;
        registry.exclusive(first, () -> {
            assertEquals(409, assertThrows(ResponseStatusException.class, () -> registry.delete(first)).getStatusCode().value());
            return null;
        });
        registry.delete(first);
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> registry.require(first)).getStatusCode().value());
        assertNotNull(registry.require(other));
        assertEquals(List.of(EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, first)), memory.cleared);
        registry.delete(first);
    }

    @Test void idleSessionIsForgottenTogetherWithItsMemory() {
        var memory = new RecordingMemory();
        var now = new AtomicReference<>(Instant.parse("2026-10-24T00:00:00Z"));
        var registry = new AiConversationRegistry(memory, now::get);
        var id = registry.open(root, "ws-1").id;
        now.set(now.get().plus(Duration.ofMinutes(31)));
        var missing = assertThrows(ResponseStatusException.class, () -> registry.require(id));
        assertEquals(404, missing.getStatusCode().value());
        assertEquals(List.of(EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, id)), memory.cleared);
    }

    @Test void capEvictsTheOldestIdleSessionButNotABusyOne() throws Exception {
        var memory = new RecordingMemory();
        var registry = new AiConversationRegistry(memory);
        var ids = new ArrayList<UUID>();
        for (int i = 0; i < AiConversationRegistry.MAX_CONVERSATIONS; i++) ids.add(registry.open(root, "ws").id);
        var release = new CountDownLatch(1);
        var started = new CountDownLatch(ids.size());
        var threads = new ArrayList<Thread>();
        for (var id : ids) {
            var worker = new Thread(() -> registry.exclusive(id, () -> {
                started.countDown();
                try { release.await(); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                return null;
            }));
            worker.start();
            threads.add(worker);
        }
        assertTrue(started.await(5, java.util.concurrent.TimeUnit.SECONDS));
        var limited = assertThrows(ResponseStatusException.class, () -> registry.open(root, "ws"));
        assertEquals(409, limited.getStatusCode().value());
        assertEquals("CONVERSATION_LIMIT", limited.getReason());
        release.countDown();
        for (var worker : threads) worker.join(5000);
        var first = registry.open(root, "ws").id;
        assertNotNull(first);
        var busy = assertThrows(ResponseStatusException.class, () -> {
            var held = new CountDownLatch(1);
            var entered = new CountDownLatch(1);
            var thread = new Thread(() -> registry.exclusive(first, () -> {
                entered.countDown();
                try { held.await(); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                return null;
            }));
            thread.start();
            try {
                entered.await();
                registry.exclusive(first, () -> null);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            } finally {
                held.countDown();
                thread.join(5000);
            }
        });
        assertEquals(409, busy.getStatusCode().value());
        assertEquals("CONVERSATION_BUSY", busy.getReason());
    }
}
