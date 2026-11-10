package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.memory.ChatMemory;

class ConversationContextEfficiencyTest {
    @TempDir Path root;

    @Test void repeatedSensitiveClearsKeepTheGuardButDoNotRewriteAnIdenticalSnapshot() {
        var memory = mock(ChatMemory.class);
        var store = mock(WorkingMemoryStore.class);
        var clock = new AtomicReference<>(Instant.parse("2026-11-10T00:00:00Z"));
        var registry = new AiConversationRegistry(memory, clock::get, store);
        var id = registry.open(root, "workspace").id;
        registry.exclusive(id, () -> { assertTrue(registry.clearContextMemory(id, true)); return null; });
        var first = registry.workingMemory(id);
        clock.set(clock.get().plusSeconds(60));
        registry.exclusive(id, () -> { assertTrue(registry.clearContextMemory(id, false)); return null; });
        assertEquals(first, registry.workingMemory(id));
        verify(memory, times(2)).clear(anyString());
        verify(store, times(1)).save(eq(id), any());
    }

    @Test void unchangedMaterialDependenciesDoNotWriteOrEraseTheCurrentTaskSummary() {
        var store = mock(WorkingMemoryStore.class);
        var registry = new AiConversationRegistry(mock(ChatMemory.class), Instant::now, store);
        var id = registry.open(root, "workspace").id;
        var deps = Set.of(TaskWorkingMemory.dependencyKnowledge("expert", 1));
        registry.putWorkingMemory(id, "goal", List.of("constraint"), List.of(), List.of(), deps);
        var first = registry.workingMemory(id);
        registry.exclusive(id, () -> {
            assertEquals(first, registry.syncMaterialDependencies(id, deps));
            return null;
        });
        verify(store, times(1)).save(eq(id), any());
        assertEquals("goal", registry.workingMemory(id).goal());
    }

    @Test void failedRequiredClearDoesNotPublishANewBinding() {
        var memory = mock(ChatMemory.class);
        var registry = new AiConversationRegistry(memory);
        var id = registry.open(root, "workspace").id;
        var old = new AiConversationRegistry.Binding(java.util.UUID.randomUUID(), 1, "old", "m", "e", "r", null);
        var next = new AiConversationRegistry.Binding(old.connectionId, 1, "next", "m", "e", "changed-configuration", null);
        registry.bind(id, old, false);
        doThrow(new IllegalStateException("clear unavailable")).when(memory).clear(anyString());
        assertThrows(IllegalStateException.class, () -> registry.reconnect(id, root, "workspace", next));
        assertSame(old, registry.binding(id));
    }

    @Test void failedWorkingMemoryRestoreDoesNotPublishAHalfRecoveredSession() {
        var store = mock(WorkingMemoryStore.class);
        var registry = new AiConversationRegistry(mock(ChatMemory.class), Instant::now, store);
        var id = java.util.UUID.randomUUID();
        var target = new AiConversationRegistry.Binding(java.util.UUID.randomUUID(), 1, "target", "m", "e", "r", null);
        when(store.load(id)).thenThrow(new IllegalStateException("storage unavailable"));
        assertThrows(IllegalStateException.class, () -> registry.reconnect(id, root, "workspace", target));
        var missing = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> registry.require(id));
        assertEquals(404, missing.getStatusCode().value());
    }
}
