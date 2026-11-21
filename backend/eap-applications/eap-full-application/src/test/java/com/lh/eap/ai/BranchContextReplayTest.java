package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;

/** Verifies branch context replay isolates the model window to one selected path (CT-02 C2). */
class BranchContextReplayTest {
    @Test
    void replayBranchReplacesLinearWindowWithSelectedPath() {
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var registry = new AiConversationRegistry(memory);
        var session = registry.open(Path.of(".").toAbsolutePath(), "ws");
        String key = ChatClients.memoryKey(AiConversationRegistry.PRINCIPAL, session.id);
        // Simulate a stale linear window mixing a sibling branch.
        memory.add(key, new org.springframework.ai.chat.messages.UserMessage("stale-other-branch"));
        memory.add(key, new org.springframework.ai.chat.messages.AssistantMessage("stale-answer"));
        assertEquals(2, registry.modelHistory(session.id).messages());

        var branch = List.of(
                AiConversationRegistry.BranchMessage.user("selected-q"),
                AiConversationRegistry.BranchMessage.assistant("selected-a"));
        registry.exclusive(session.id, () -> {
            registry.replayBranch(session.id, branch);
            return null;
        });

        var messages = memory.get(key);
        assertEquals(2, messages.size());
        assertEquals("selected-q", messages.get(0).getText());
        assertEquals("selected-a", messages.get(1).getText());
        assertTrue(messages.stream().noneMatch(m -> String.valueOf(m.getText()).contains("stale")));
    }

    @Test
    void replayBranchRequiresExclusiveTurn() {
        var registry = new AiConversationRegistry(MessageWindowChatMemory.builder().build());
        var session = registry.open(Path.of(".").toAbsolutePath(), "ws");
        assertThrows(IllegalStateException.class,
                () -> registry.replayBranch(session.id, List.of(AiConversationRegistry.BranchMessage.user("q"))));
    }

    @Test
    void branchMessageRejectsInvalidRoleAndEmptyText() {
        assertThrows(IllegalArgumentException.class, () -> new AiConversationRegistry.BranchMessage("TOOL", "x"));
        assertThrows(IllegalArgumentException.class, () -> new AiConversationRegistry.BranchMessage("USER", " "));
        assertDoesNotThrow(() -> AiConversationRegistry.BranchMessage.assistant("ok"));
    }
}
