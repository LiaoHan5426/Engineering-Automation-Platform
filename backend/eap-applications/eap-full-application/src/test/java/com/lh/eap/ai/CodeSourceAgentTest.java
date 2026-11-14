package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.api.CliExecution;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.delivery.CodeGenerationStore;
import com.lh.eap.delivery.ComponentGraph;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.ToolResponseMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

class CodeSourceAgentTest {
    @TempDir Path root;
    @Test void sourceAgentRequiresCodePurposeAndAnExplicitTaskBinding() {
        var handlers = new CapabilityHandlerRegistry(List.of());
        var app = ChatApplicationTestSupport.graph(new AiChatApplication(new AiConnectionStatus(handlers, root, null, "none", "", "", false, null),
                new AiConversationRegistry(MessageWindowChatMemory.builder().build()),
                new EngineeringChatService(null, handlers, root, new FileExecutionArtifactStore(root.resolve("artifacts"))), root));
        for (String context : List.of("{\"mode\":\"chat\"}", "{\"mode\":\"plan\"}", "{\"mode\":\"code\",\"targetPath\":\"Page.vue\"}")) {
            var conversation = app.open("{}").conversationId();
            var failure = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> app.send(conversation, ChatApplicationTestSupport.request(app, conversation,  "{\"message\":\"Implement task\",\"toolMode\":\"code_sources\",\"context\":" + context + "}")));
            assertEquals(400, failure.getStatusCode().value());
            assertEquals("INVALID_CHAT_REQUEST", failure.getReason());
        }
    }
    CodeGenerationStore.Snapshot snapshot() {
        return new CodeGenerationStore.Snapshot(UUID.randomUUID(), "operator", UUID.randomUUID(), root.toString(),
                "Page.vue", "hash", "<template>original</template>", "", "", Instant.now(), null,
                List.of(new ComponentGraph.Source("copy.json", "copy-hash", "{\"title\":\"Original title\"}")));
    }
    @Test void springAiLoopReadsFrozenSourcesBeforeReturningCandidateWithoutWriting() throws Exception {
        var checks = new AtomicInteger();
        var tool = new CodeSourceTool(snapshot(), checks::incrementAndGet, () -> false);
        var calls = new AtomicInteger();
        var model = FakeChatModels.scripted(prompt -> {
            if (calls.incrementAndGet() == 1) return new ChatResponse(List.of(new Generation(AssistantMessage.builder().content("")
                    .toolCalls(List.of(new AssistantMessage.ToolCall("read-1", "function", "read_selected_sources", "{\"paths\":[\"Page.vue\",\"copy.json\"]}"))).build())));
            assertTrue(prompt.getInstructions().stream().anyMatch(message -> message instanceof ToolResponseMessage tools &&
                    tools.getResponses().stream().anyMatch(response -> response.responseData().contains("Original title"))));
            return FakeChatModels.text("{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}");
        });
        var client = ChatClients.createClient(ChatClient.builder(model), MessageWindowChatMemory.builder().build());
        var service = new EngineeringChatService(client, new CapabilityHandlerRegistry(List.of()), root,
                new FileExecutionArtifactStore(root.resolve("artifacts")));
        var result = service.chat(new EngineeringChatService.Request("operator", UUID.randomUUID(), root, false, "Implement selected task"),
                false, client, TaskContext.parse(Map.of("mode", "code", "targetPath", "Page.vue")), UUID.randomUUID(), () -> false, null, tool);
        assertEquals(2, calls.get()); assertEquals(2, checks.get());
        assertEquals("", result.error()); assertEquals(CliExecution.Status.SUCCEEDED, result.execution().status());
        assertEquals("TOOL_SUCCEEDED", result.execution().trace().stdoutLines().getFirst().text());
        assertFalse(java.nio.file.Files.exists(root.resolve("Page.vue")));
    }
    @Test void rejectsUnselectedDuplicateMalformedAndRepeatedReadsAndNeverCallsTheAuthorityCheckForInvalidInput() {
        for (String input : List.of("{\"paths\":[\"../outside.vue\"]}", "{\"paths\":[\"Page.vue\",\"Page.vue\"]}",
                "{\"paths\":[]}", "{\"paths\":[\"Page.vue\"],\"shell\":\"x\"}", "{\"paths\":[\"Page.vue\"],\"paths\":[]}")) {
            var checks = new AtomicInteger();
            var tool = new CodeSourceTool(snapshot(), checks::incrementAndGet, () -> false);
            assertEquals("TOOL_INVALID_ARGUMENTS", tool.call(input));
            assertEquals(0, checks.get()); assertEquals("TOOL_INVALID_ARGUMENTS", tool.completionError());
        }
        var tool = new CodeSourceTool(snapshot(), () -> {}, () -> false);
        assertEquals("CODE_GENERATION_SCOPE_MISMATCH", tool.completionError());
        assertTrue(tool.call("{\"paths\":[\"Page.vue\"]}").contains("original"));
        assertEquals("TOOL_INVALID_ARGUMENTS", tool.call("{\"paths\":[\"Page.vue\"]}"));
    }
    @Test void cancellationAndChangedAuthorityPreventContentDisclosure() {
        var tool = new CodeSourceTool(snapshot(), () -> { throw new AssertionError("Must not run"); }, () -> true);
        assertEquals("AI_CANCELLED", tool.call("{\"paths\":[\"Page.vue\"]}"));
        var changed = new CodeSourceTool(snapshot(), () -> { throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.CONFLICT, "CODE_GENERATION_BASELINE_CHANGED"); }, () -> false);
        assertEquals("CODE_GENERATION_BASELINE_CHANGED", changed.call("{\"paths\":[\"Page.vue\"]}"));
    }
    @Test void skippedReadsAndAuthorityChangesAfterTheLastReadRejectTheFinalCandidate() {
        for (boolean readFirst : List.of(false, true)) {
            var changed = new java.util.concurrent.atomic.AtomicBoolean();
            var tool = new CodeSourceTool(snapshot(), () -> {
                if (changed.get()) throw new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.CONFLICT, "CODE_TASK_SNAPSHOT_CHANGED");
            }, () -> false);
            if (readFirst) tool.call("{\"paths\":[\"Page.vue\",\"copy.json\"]}");
            changed.set(true);
            var client = ChatClients.createClient(ChatClient.builder(FakeChatModels.scripted(prompt -> FakeChatModels.text(
                    "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}"))), MessageWindowChatMemory.builder().build());
            var service = new EngineeringChatService(client, new CapabilityHandlerRegistry(List.of()), root,
                    new FileExecutionArtifactStore(root.resolve("artifacts")));
            var result = service.chat(new EngineeringChatService.Request("operator", UUID.randomUUID(), root, false, "Implement selected task"),
                    false, client, TaskContext.parse(Map.of("mode", "code", "targetPath", "Page.vue")), UUID.randomUUID(), () -> false, null, tool);
            assertEquals(readFirst ? "CODE_TASK_SNAPSHOT_CHANGED" : "CODE_GENERATION_SCOPE_MISMATCH", result.error());
            assertEquals("", result.answer());
            assertEquals(CliExecution.Status.FAILED, result.execution().status());
        }
    }
}
