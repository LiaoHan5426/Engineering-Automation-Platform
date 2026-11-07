package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.UserMessage;

class WorkingMemoryPersistenceTest {
    @TempDir Path root;

    @Test
    void reconnectAfterProcessLossRestoresWorkingMemoryButNotModelWindow() {
        var store = new FileWorkingMemoryStore(root.resolve(".eap").resolve("working-memory"));
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var registry = new AiConversationRegistry(memory, Instant::now, store);
        var session = registry.open(root, "ws");
        registry.putWorkingMemory(session.id, "交付登录", List.of("复用组件"), List.of(), List.of(), Set.of());
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, session.id);
        memory.add(key, new UserMessage("model-only"));
        assertEquals(1, memory.get(key).size());

        // Simulate process restart: new registry + memory, same store path and conversation id.
        var memory2 = MessageWindowChatMemory.builder().maxMessages(20).build();
        var registry2 = new AiConversationRegistry(memory2, Instant::now, store);
        var reconnected = registry2.reconnect(session.id, root, "ws");
        assertTrue(reconnected.contextReset());
        assertTrue(memory2.get(key).isEmpty());
        assertEquals("交付登录", registry2.workingMemory(session.id).goal());
        assertTrue(registry2.workingMemory(session.id).active());
    }

    @Test
    void idleEvictionDoesNotPurgeStoreButExplicitDeleteDoes() {
        var store = new FileWorkingMemoryStore(root.resolve("wm"));
        var now = new AtomicReference<>(Instant.parse("2026-11-07T00:00:00Z"));
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(20).build(), now::get, store);
        var session = registry.open(root, "ws");
        registry.putWorkingMemory(session.id, "目标", List.of(), List.of(), List.of(), Set.of());
        now.set(now.get().plusSeconds(1801));
        registry.open(root, "ws"); // sweep expired
        assertTrue(store.load(session.id).isPresent());
        registry.delete(session.id);
        assertTrue(store.load(session.id).isEmpty());
    }

    @Test
    void sensitiveClearPersistsInvalidationAcrossReconnect() {
        var store = new FileWorkingMemoryStore(root.resolve("wm2"));
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(20).build(), Instant::now, store);
        var session = registry.open(root, "ws");
        registry.putWorkingMemory(session.id, "目标", List.of(), List.of(), List.of(), Set.of());
        registry.exclusive(session.id, () -> {
            registry.clearContextMemory(session.id, true);
            return null;
        });
        assertEquals("DERIVED_CONTEXT_CLEARED", registry.workingMemory(session.id).invalidation());

        var registry2 = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(20).build(), Instant::now, store);
        registry2.reconnect(session.id, root, "ws");
        assertEquals("DERIVED_CONTEXT_CLEARED", registry2.workingMemory(session.id).invalidation());
        assertFalse(registry2.workingMemory(session.id).active());
    }
}
