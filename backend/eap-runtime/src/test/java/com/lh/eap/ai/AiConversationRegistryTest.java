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

    static final class RecordingMemory implements ChatMemory {
        final ChatMemory delegate = MessageWindowChatMemory.builder().maxMessages(20).build();
        final List<String> cleared = new ArrayList<>();
        public void add(String conversationId, List<Message> messages) { delegate.add(conversationId, messages); }
        public List<Message> get(String conversationId) { return delegate.get(conversationId); }
        public void clear(String conversationId) { cleared.add(conversationId); delegate.clear(conversationId); }
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
