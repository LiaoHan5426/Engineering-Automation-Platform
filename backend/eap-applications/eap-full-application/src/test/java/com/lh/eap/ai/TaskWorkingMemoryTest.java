package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;

class TaskWorkingMemoryTest {
    @TempDir Path root;

    @Test
    void layersStaySeparateAndSensitiveClearInvalidatesWorkingMemoryWithoutCancellingGuard() {
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var registry = new AiConversationRegistry(memory);
        var session = registry.open(root, "ws");
        var key = EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, session.id);
        memory.add(key, new org.springframework.ai.chat.messages.UserMessage("model-turn"));

        var snapshot = registry.putWorkingMemory(session.id, "交付登录页",
                List.of("复用现有组件"), List.of(new TaskWorkingMemory.FactRef("knowledge", "expert-a", "2")),
                List.of("evidence:run-1"),
                Set.of(TaskWorkingMemory.dependencyKnowledge("expert-a", 2)));
        assertTrue(snapshot.active());
        assertTrue(snapshot.layers().contains(TaskWorkingMemory.LAYER_TASK_WORKING));
        assertEquals(1, memory.get(key).size());

        registry.exclusive(session.id, () -> {
            assertTrue(registry.clearContextMemory(session.id, true));
            return null;
        });
        assertTrue(memory.get(key).isEmpty());
        var cleared = registry.workingMemory(session.id);
        assertFalse(cleared.active());
        assertEquals("DERIVED_CONTEXT_CLEARED", cleared.invalidation());
        // Sticky guard remains: subsequent exclusive turn still clears even without new selection.
        memory.add(key, new org.springframework.ai.chat.messages.UserMessage("again"));
        registry.exclusive(session.id, () -> {
            assertTrue(registry.clearContextMemory(session.id, false));
            return null;
        });
        assertTrue(memory.get(key).isEmpty());
    }

    @Test
    void modelSwitchAndDeleteInvalidateOrDropWorkingMemory() {
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(20).build());
        var session = registry.open(root, "ws");
        registry.putWorkingMemory(session.id, "目标", List.of(), List.of(), List.of(), Set.of());
        assertTrue(registry.workingMemory(session.id).active());

        registry.bind(session.id,
                new AiConversationRegistry.Binding(UUID.randomUUID(), 1, "n", "m", "e", "r", null), true);
        assertEquals("MODEL_OR_BINDING_SWITCH", registry.workingMemory(session.id).invalidation());

        registry.putWorkingMemory(session.id, "再填", List.of(), List.of(), List.of(), Set.of());
        registry.delete(session.id);
        assertEquals("UNKNOWN_CONVERSATION",
                assertThrows(org.springframework.web.server.ResponseStatusException.class,
                        () -> registry.workingMemory(session.id)).getReason());
    }

    @Test
    void snapshotOmitsBodiesAndCapsFields() {
        var state = TaskWorkingMemory.State.empty();
        state.replace("g".repeat(600), List.of("c".repeat(300)), List.of(), List.of("e".repeat(300)), Set.of("d1"), null);
        var snap = state.snapshot();
        assertEquals(500, snap.goal().length());
        assertEquals(200, snap.constraints().getFirst().length());
        assertEquals(200, snap.evidenceRefs().getFirst().length());
        assertFalse(snap.toString().contains("secret-body"));
    }

    @Test
    void linkTaskAndExecutionAssociatesRunAndInvalidatesOnTaskSwitch() {
        var store = new FileWorkingMemoryStore(root.resolve("wm-link"));
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().maxMessages(20).build(),
                java.time.Instant::now, store);
        var session = registry.open(root, "ws");
        registry.putWorkingMemory(session.id, "交付登录", List.of("复用组件"), List.of(), List.of(), Set.of());
        var taskA = new com.lh.eap.api.TaskRef("proj", UUID.randomUUID(), 1);
        var exec1 = UUID.randomUUID();
        var linked = registry.exclusive(session.id, () -> registry.linkTaskAndExecution(session.id, taskA, exec1));
        assertEquals("交付登录", linked.goal());
        assertTrue(linked.dependencyKeys().contains(
                TaskWorkingMemory.dependencyTask(taskA.projectId(), taskA.taskId().toString(), taskA.revision())));
        assertTrue(linked.evidenceRefs().contains(TaskWorkingMemory.evidenceExecution(exec1)));

        var exec2 = UUID.randomUUID();
        var sameTask = registry.exclusive(session.id, () -> registry.linkTaskAndExecution(session.id, taskA, exec2));
        assertEquals(2, sameTask.evidenceRefs().size());
        assertTrue(sameTask.evidenceRefs().contains(TaskWorkingMemory.evidenceExecution(exec2)));
        assertEquals("交付登录", sameTask.goal());

        var taskB = new com.lh.eap.api.TaskRef("proj", UUID.randomUUID(), 1);
        var switched = registry.exclusive(session.id,
                () -> registry.linkTaskAndExecution(session.id, taskB, UUID.randomUUID()));
        assertTrue(switched.goal().isBlank());
        assertEquals(1, switched.dependencyKeys().size());
        assertTrue(switched.dependencyKeys().contains(
                TaskWorkingMemory.dependencyTask(taskB.projectId(), taskB.taskId().toString(), taskB.revision())));
        assertEquals(1, switched.evidenceRefs().size());
        assertTrue(store.load(session.id).isPresent());
        assertEquals(switched.dependencyKeys(), store.load(session.id).orElseThrow().dependencyKeys());
    }
}
