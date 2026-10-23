package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.api.CliExecution;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.domain.model.*;
import com.lh.eap.runtime.handler.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.MessageChatMemoryAdvisor;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;

class EngineeringChatServiceTest {
    @TempDir Path root;
    ChatResponse text(String text) { return new ChatResponse(List.of(new Generation(new AssistantMessage(text)))); }
    ChatResponse tool() { return new ChatResponse(List.of(new Generation(AssistantMessage.builder().content("")
            .toolCalls(List.of(new AssistantMessage.ToolCall("call-1", "function", "gitStatus", "{}"))).build()))); }
    EngineeringChatService service(ChatModel model, CapabilityHandler handler) {
        ChatModel fake = model == null ? null : FakeChatModels.scripted(model::call);
        var client = fake == null ? null : EngineeringAiConfiguration.createClient(ChatClient.builder(fake),
                MessageWindowChatMemory.builder().build());
        return new EngineeringChatService(client, new CapabilityHandlerRegistry(handler == null ? List.of() : List.of(handler)),
                root, new FileExecutionArtifactStore(root.resolve("artifacts")));
    }
    EngineeringChatService.Request request(boolean allowed) {
        return new EngineeringChatService.Request("operator", UUID.randomUUID(), root, allowed, "inspect repository");
    }
    CapabilityHandler handler(AtomicInteger calls, boolean fail) {
        return new CapabilityHandler() {
            public Set<String> capabilities() { return Set.of("git-status"); }
            public NodeResult handle(CapabilityContext context) {
                calls.incrementAndGet();
                assertEquals(root, context.workspace());
                if (fail) throw new IllegalStateException("token=do-not-leak");
                return new NodeResult(true, false, "ok", Map.of("stdout", "?? hello.txt"));
            }
        };
    }
    @Test void ordinaryConversationAndRealArtifact() throws Exception {
        var outcome = service(p -> text("hello"), null).chat(request(false));
        assertEquals("hello", outcome.answer());
        assertEquals(CliExecution.Status.SUCCEEDED, outcome.execution().status());
        assertEquals(CliExecution.Verification.UNVERIFIED, outcome.execution().verification());
        assertEquals(CliExecution.Approval.NOT_REQUIRED, outcome.execution().approval());
        var artifact = outcome.execution().artifacts().getFirst();
        assertEquals(outcome.executionId(), artifact.executionId());
        assertTrue(Files.exists(root.resolve("artifacts").resolve(artifact.relativePath())));
        assertEquals(64, artifact.sha256().length());
    }
    @Test void springAiExecutesToolAndReturnsResultToModel() throws Exception {
        var calls = new AtomicInteger(); var turns = new AtomicInteger();
        var outcome = service(p -> {
            if (turns.getAndIncrement() == 0) return tool();
            assertTrue(p.getInstructions().stream().anyMatch(m -> m instanceof ToolResponseMessage response
                    && response.getResponses().stream().anyMatch(r -> r.responseData().contains("hello.txt"))));
            return text("repository inspected");
        }, handler(calls, false)).chat(request(true));
        assertEquals(2, turns.get(), outcome.toString()); assertEquals(1, calls.get(), outcome.toString());
        assertEquals("repository inspected", outcome.answer());
        assertEquals("", outcome.error());
        assertEquals("TOOL_SUCCEEDED", outcome.execution().trace().stdoutLines().getFirst().text());
        var artifact = outcome.execution().artifacts().getFirst();
        var audit = Files.readString(root.resolve("artifacts").resolve(artifact.relativePath()));
        assertTrue(audit.contains("TOOL_SUCCEEDED"));
        assertTrue(audit.contains("receivedAt"));
        assertFalse(audit.contains("hello.txt"));
    }
    @Test void deniedToolIsNotExecutedAndDenialReturnsToModel() {
        var calls = new AtomicInteger(); var turns = new AtomicInteger();
        var outcome = service(p -> turns.getAndIncrement() == 0 ? tool() : text("denied"), handler(calls, false))
                .chat(request(false));
        assertEquals(0, calls.get()); assertEquals("TOOL_PERMISSION_DENIED", outcome.error());
        assertEquals(outcome.error(), outcome.execution().trace().toolError());
    }
    @Test void toolFailureIsSanitized() {
        var turns = new AtomicInteger();
        var outcome = service(p -> turns.getAndIncrement() == 0 ? tool() : text("tool failed"), handler(new AtomicInteger(), true))
                .chat(request(true));
        assertEquals("TOOL_FAILED", outcome.error());
        assertFalse(outcome.toString().contains("do-not-leak"));
    }
    @Test void missingProviderFailsExplicitly() {
        var outcome = service(null, null).chat(request(false));
        assertEquals("AI_NOT_CONFIGURED", outcome.error());
        assertEquals(CliExecution.Status.REJECTED, outcome.execution().status());
    }
    @Test void providerExceptionDoesNotLeakCredentials() {
        var outcome = service(p -> { throw new IllegalArgumentException("Bearer top-secret"); }, null).chat(request(false));
        assertEquals("AI_PROVIDER_ERROR", outcome.error());
        assertFalse(outcome.toString().contains("top-secret"));
    }
    @Test void memoryIsIsolatedByPrincipalAndConversation() {
        var seen = new ArrayList<Prompt>();
        var service = service(p -> { seen.add(p); return text("answer"); }, null);
        var id = UUID.randomUUID();
        service.chat(new EngineeringChatService.Request("a", id, root, false, "private-message"));
        service.chat(new EngineeringChatService.Request("b", id, root, false, "second"));
        assertFalse(seen.get(1).getContents().contains("private-message"));
        service.chat(new EngineeringChatService.Request("a", id, root, false, "third"));
        assertTrue(seen.get(2).getContents().contains("private-message"));
        service.chat(request(false));
        assertFalse(seen.get(3).getContents().contains("private-message"));
    }
    @Test void workspaceEscapeDeniedBeforeHandler() {
        var calls = new AtomicInteger(); var turns = new AtomicInteger();
        var outcome = service(p -> turns.getAndIncrement() == 0 ? tool() : text("denied"), handler(calls, false))
                .chat(new EngineeringChatService.Request("a", UUID.randomUUID(), root.getParent(), true, "inspect"));
        assertEquals("TOOL_PERMISSION_DENIED", outcome.error()); assertEquals(0, calls.get());
    }
    @Test void realGitStatusRoundTripUsesExistingEngineeringHandler() throws Exception {
        try (var executor = new com.lh.eap.core.DefaultProcessExecutor()) {
            var init = executor.run("init", root, List.of("git", "init"));
            assertTrue(init.success(), init.stderr());
            Files.writeString(root.resolve("example.txt"), "offline engineering tool");
            var capabilities = new com.lh.eap.core.CapabilityRegistry()
                    .register(new com.lh.eap.capability.GitCapability("status"));
            var handler = new GitInspectionHandler(capabilities, executor);
            var turns = new AtomicInteger();
            var outcome = service(p -> {
                if (turns.getAndIncrement() == 0) return tool();
                assertTrue(p.getInstructions().stream().filter(ToolResponseMessage.class::isInstance)
                        .map(ToolResponseMessage.class::cast).flatMap(m -> m.getResponses().stream())
                        .anyMatch(r -> r.responseData().contains("example.txt")));
                return text("Git inspection completed offline");
            }, handler).chat(request(true));
            assertEquals("", outcome.error()); assertEquals(2, turns.get());
            assertEquals("Git inspection completed offline", outcome.answer());
        }
    }
    @Test void artifactFailureRemainsSeparateFromModelSuccess() {
        var client = EngineeringAiConfiguration.createClient(ChatClient.builder((ChatModel) p -> text("answer")),
                MessageWindowChatMemory.builder().build());
        var service = new EngineeringChatService(client, new CapabilityHandlerRegistry(List.of()), root,
                (id, kind, bytes) -> { throw new java.io.IOException("secret=hidden"); });
        var outcome = service.chat(request(false));
        assertEquals(CliExecution.Status.SUCCEEDED, outcome.execution().status());
        assertEquals("ARTIFACT_SAVE_FAILED", outcome.execution().artifactError());
        assertTrue(outcome.execution().artifacts().isEmpty());
        assertFalse(outcome.toString().contains("hidden"));
    }
    @Test void globallyDisabledCapabilityCannotBeExecuted() {
        var calls = new AtomicInteger(); var turns = new AtomicInteger();
        var settings = new com.lh.eap.application.service.CapabilitySettings(null, null) {
            @Override public boolean enabled(String capability) { return false; }
        };
        ChatModel model = new ChatModel() {
            public ChatResponse call(Prompt p) {
                if (turns.getAndIncrement() == 0) return tool();
                assertTrue(p.getInstructions().stream().filter(ToolResponseMessage.class::isInstance)
                        .map(ToolResponseMessage.class::cast).flatMap(m -> m.getResponses().stream())
                        .anyMatch(r -> r.responseData().contains("TOOL_PERMISSION_DENIED")));
                return text("denied");
            }
            public org.springframework.ai.chat.prompt.ChatOptions getOptions() {
                return org.springframework.ai.model.tool.ToolCallingChatOptions.builder().build();
            }
        };
        var client = EngineeringAiConfiguration.createClient(ChatClient.builder(model), MessageWindowChatMemory.builder().build());
        var service = new EngineeringChatService(client, new CapabilityHandlerRegistry(List.of(handler(calls, false)), settings),
                root, new FileExecutionArtifactStore(root.resolve("artifacts")));
        assertEquals("TOOL_PERMISSION_DENIED", service.chat(request(true)).error());
        assertEquals(0, calls.get());
    }
    @Test void frameworkStopsRepeatedToolRequestsAtItsConfiguredLimit() {
        var calls = new AtomicInteger();
        var outcome = service(p -> tool(), handler(calls, false)).chat(request(true));
        assertEquals(4, calls.get());
        assertEquals("TOOL_CALL_LIMIT", outcome.error());
        assertEquals("TOOL_CALL_LIMIT", outcome.execution().trace().toolError());
    }
    @Test void modelCannotSupplyPathsOrShellArgumentsToReadOnlyTool() {
        var calls = new AtomicInteger(); var turns = new AtomicInteger();
        var outcome = service(p -> {
            if (turns.getAndIncrement() == 0) return new ChatResponse(List.of(new Generation(
                    AssistantMessage.builder().content("").toolCalls(List.of(new AssistantMessage.ToolCall(
                            "invalid", "function", "gitStatus", "{\"directory\":\"../outside\",\"command\":\"unsafe\"}"))).build())));
            assertTrue(p.getInstructions().stream().filter(ToolResponseMessage.class::isInstance)
                    .map(ToolResponseMessage.class::cast).flatMap(m -> m.getResponses().stream())
                    .anyMatch(r -> r.responseData().contains("TOOL_INVALID_ARGUMENTS")));
            return text("invalid arguments rejected");
        }, handler(calls, false)).chat(request(true));
        assertEquals(0, calls.get()); assertEquals("TOOL_INVALID_ARGUMENTS", outcome.error());
    }
    @Test void executionsHaveSeparateEvidenceAndRedactModelOutput() {
        var service = service(p -> text("api_key=confidential Bearer hidden sk-testcredential"), null);
        var first = service.chat(request(false)); var second = service.chat(request(false));
        assertNotEquals(first.executionId(), second.executionId());
        assertNotEquals(first.execution().artifacts().getFirst().relativePath(), second.execution().artifacts().getFirst().relativePath());
        assertFalse(first.answer().contains("confidential")); assertFalse(first.answer().contains("hidden"));
        assertFalse(first.answer().contains("sk-testcredential"));
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"timeout,AI_TIMED_OUT,TIMED_OUT", "cancel,AI_CANCELLED,CANCELLED"})
    void modelTimeoutAndCancellationKeepExecutionAndVerificationSeparate(String mode, String error, String status) {
        var outcome = service(p -> {
            if (mode.equals("cancel")) throw new java.util.concurrent.CancellationException("secret");
            throw new RuntimeException(new java.net.SocketTimeoutException("secret"));
        }, null).chat(request(false));
        assertEquals(error, outcome.error()); assertEquals(status, outcome.execution().status().name());
        assertEquals(CliExecution.Verification.UNVERIFIED, outcome.execution().verification());
        assertFalse(outcome.toString().contains("secret"));
    }
}
