package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.web.server.ResponseStatusException;

class WorkingMemoryApiTest {
    @TempDir Path root;

    @Test
    void putWorkingMemoryRoundTripAndRejectsUnknownFields() {
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var handlers = new CapabilityHandlerRegistry(List.of());
        var app = ChatApplicationTestSupport.graph(new AiChatApplication(
                new AiConnectionStatus(handlers, root, null, "none", "", "", false, null),
                new AiConversationRegistry(memory),
                new EngineeringChatService(null, handlers, (Path) null,
                        new FileExecutionArtifactStore(root.resolve("artifacts"))),
                root));
        var opened = app.open("{}");
        var snapshot = app.putWorkingMemory(opened.conversationId(),
                "{\"expectedUpdatedAt\":\"1970-01-01T00:00:00Z\",\"goal\":\"交付登录\",\"constraints\":[\"复用组件\"],\"facts\":[{\"kind\":\"knowledge\",\"id\":\"e1\",\"revisionOrDigest\":\"2\"}],\"evidenceRefs\":[\"run:1\"],\"dependencyKeys\":[\"knowledge:e1:2\"]}");
        assertEquals("交付登录", snapshot.goal());
        assertEquals(1, snapshot.constraints().size());
        assertEquals(1, snapshot.facts().size());
        assertTrue(app.conversation(opened.conversationId()).workingMemory().active());
        assertEquals("WORKING_MEMORY_CHANGED", assertThrows(ResponseStatusException.class,
                () -> app.putWorkingMemory(opened.conversationId(), "{\"expectedUpdatedAt\":\"1970-01-01T00:00:00Z\",\"goal\":\"stale\"}")).getReason());
        assertEquals(snapshot, app.conversation(opened.conversationId()).workingMemory());
        assertEquals("INVALID_CHAT_REQUEST", assertThrows(ResponseStatusException.class,
                () -> app.putWorkingMemory(opened.conversationId(), "{\"goal\":\"x\",\"secret\":\"no\"}")).getReason());
    }
}
