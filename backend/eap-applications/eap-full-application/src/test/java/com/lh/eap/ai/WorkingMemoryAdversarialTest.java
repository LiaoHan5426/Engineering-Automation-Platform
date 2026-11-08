package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.UserMessage;

/**
 * MEM-01 adversarial invalidation cases. Sticky ChatMemory clear remains required;
 * these cases harden dependency-keyed working-memory invalidation as a prerequisite for any future clear replacement.
 */
class WorkingMemoryAdversarialTest {
    @TempDir Path root;

    @Test
    void putAfterSensitiveClearDoesNotCancelStickyModelWindowClear() {
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var registry = new AiConversationRegistry(memory);
        var session = registry.open(root, "ws");
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, session.id);
        registry.putWorkingMemory(session.id, "目标", List.of("约束"), List.of(), List.of(),
                Set.of(TaskWorkingMemory.dependencyKnowledge("expert-a", 1)));
        registry.exclusive(session.id, () -> {
            assertTrue(registry.clearContextMemory(session.id, true));
            return null;
        });
        assertEquals("DERIVED_CONTEXT_CLEARED", registry.workingMemory(session.id).invalidation());
        registry.putWorkingMemory(session.id, "试图复活", List.of(), List.of(), List.of(), Set.of());
        assertEquals("试图复活", registry.workingMemory(session.id).goal());
        memory.add(key, new UserMessage("derived-with-knowledge"));
        assertEquals(1, memory.get(key).size());
        registry.exclusive(session.id, () -> {
            assertTrue(registry.clearContextMemory(session.id, false));
            return null;
        });
        assertTrue(memory.get(key).isEmpty());
        assertEquals("DERIVED_CONTEXT_CLEARED", registry.workingMemory(session.id).invalidation());
    }

    @Test
    void staleKnowledgeDependencyInvalidatesBeforeRebind() {
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(20).build());
        var session = registry.open(root, "ws");
        String stale = TaskWorkingMemory.dependencyKnowledge("expert-a", 1);
        String next = TaskWorkingMemory.dependencyKnowledge("expert-a", 2);
        registry.putWorkingMemory(session.id, "沿用旧知识摘要", List.of("勿泄漏"),
                List.of(new TaskWorkingMemory.FactRef("knowledge", "expert-a", "1")), List.of(), Set.of(stale));
        var synced = registry.exclusive(session.id, () -> registry.syncMaterialDependencies(session.id, Set.of(next)));
        assertTrue(synced.goal().isBlank());
        assertTrue(synced.facts().isEmpty());
        assertEquals(Set.of(next), synced.dependencyKeys());
        assertTrue(synced.invalidation().isBlank());

        registry.putWorkingMemory(session.id, "新目标", List.of(), List.of(), List.of(), Set.of(next));
        var same = registry.exclusive(session.id, () -> registry.syncMaterialDependencies(session.id, Set.of(next)));
        assertEquals("新目标", same.goal());
        assertEquals(Set.of(next), same.dependencyKeys());
    }

    @Test
    void skillSwapAndTaskSwitchDropPriorDerivedWorkingMemory() {
        var store = new FileWorkingMemoryStore(root.resolve("wm-adv"));
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(20).build(),
                java.time.Instant::now, store);
        var session = registry.open(root, "ws");
        String skillA = TaskWorkingMemory.dependencySkill("guide", "1.0.0", "aaa");
        String skillB = TaskWorkingMemory.dependencySkill("guide", "1.0.0", "bbb");
        registry.putWorkingMemory(session.id, "Skill 派生", List.of(), List.of(), List.of("evidence:old"), Set.of(skillA));
        var afterSkill = registry.exclusive(session.id, () -> registry.syncMaterialDependencies(session.id, Set.of(skillB)));
        assertTrue(afterSkill.goal().isBlank());
        assertTrue(afterSkill.evidenceRefs().isEmpty());
        assertEquals(Set.of(skillB), afterSkill.dependencyKeys());

        var taskA = new com.lh.eap.api.TaskRef("proj", UUID.randomUUID(), 1);
        registry.putWorkingMemory(session.id, "任务目标", List.of(), List.of(), List.of("evidence:keep"),
                Set.of(TaskWorkingMemory.dependencyTask(taskA.projectId(), taskA.taskId().toString(), taskA.revision())));
        var taskB = new com.lh.eap.api.TaskRef("proj", UUID.randomUUID(), 1);
        var switched = registry.exclusive(session.id,
                () -> registry.linkTaskAndExecution(session.id, taskB, UUID.randomUUID()));
        assertTrue(switched.goal().isBlank());
        assertEquals(1, switched.evidenceRefs().size());
        assertTrue(switched.evidenceRefs().getFirst().startsWith("execution:"));
        assertTrue(store.load(session.id).isPresent());
        assertEquals(switched.dependencyKeys(), store.load(session.id).orElseThrow().dependencyKeys());
    }

    @Test
    void reconnectCannotReviveClearedModelWindowOrInvalidatedWorkingMemoryBodies() {
        var store = new FileWorkingMemoryStore(root.resolve("wm-adv2"));
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var registry = new AiConversationRegistry(memory, java.time.Instant::now, store);
        var session = registry.open(root, "ws");
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, session.id);
        registry.putWorkingMemory(session.id, "敏感目标", List.of("密约束"), List.of(), List.of(), Set.of());
        memory.add(key, new UserMessage("model-body-with-secret"));
        registry.exclusive(session.id, () -> {
            registry.clearContextMemory(session.id, true);
            return null;
        });
        var memory2 = MessageWindowChatMemory.builder().maxMessages(20).build();
        var registry2 = new AiConversationRegistry(memory2, java.time.Instant::now, store);
        registry2.reconnect(session.id, root, "ws");
        assertTrue(memory2.get(key).isEmpty());
        assertEquals("DERIVED_CONTEXT_CLEARED", registry2.workingMemory(session.id).invalidation());
        assertFalse(registry2.workingMemory(session.id).active());
        assertFalse(registry2.workingMemory(session.id).goal().contains("敏感"));
    }
}
