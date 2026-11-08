package com.lh.eap.ai;

import com.lh.eap.api.Observation;
import com.lh.eap.core.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.runtime.handler.*;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import java.util.function.Function;
import org.junit.jupiter.api.*;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.*;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SqlExpertAgentServiceTest {
    private final List<SqlExpertAgentService> services = new ArrayList<>();
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicBoolean revoked = new AtomicBoolean();
    private final AtomicBoolean switchedOff = new AtomicBoolean();
    private final AtomicInteger modelCalls = new AtomicInteger();
    private final List<Observation> persisted = new CopyOnWriteArrayList<>();
    private final Set<UUID> claimed = ConcurrentHashMap.newKeySet();
    private final ExpertManifest manifest = new ExpertManifest("eap/v2", "Expert", "fixture", "Fixture",
            List.of(), List.of(), List.of(), List.of(), List.of("database.credentials.never-expose"), List.of(), List.of(),
            SqlExpertAgentService.BINDING, new ExpertAgentDefinition("Find evidence before suggesting changes", List.of("sql.parse", "database.explain", "knowledge.search")));
    private final ExpertAgentAccess access = new ExpertAgentAccess() {
        public Snapshot load(String id) { return new Snapshot(manifest, 7); }
        public void check(Snapshot snapshot) { if (revoked.get()) throw new IllegalStateException("revoked"); }
        public <T> T authorized(Snapshot snapshot, Function<List<UUID>,T> read) { check(snapshot); return read.apply(List.of()); }
        public void begin(UUID id, Snapshot snapshot, String goal) { if (!claimed.add(id)) throw new IllegalStateException("replay"); }
        public void finish(UUID id, String status, String modelState, List<Observation> observations) { persisted.addAll(observations); }
    };

    @AfterEach void close() { services.forEach(SqlExpertAgentService::close); }
    private SqlExpertAgentService service(Function<Prompt,ChatResponse> script) { return service(script, Duration.ofSeconds(5), false); }
    private SqlExpertAgentService service(Function<Prompt,ChatResponse> script, Duration duration, boolean incomplete) {
        ChatModel model = new ChatModel() {
            public ChatResponse call(Prompt prompt) { modelCalls.incrementAndGet(); return script.apply(prompt); }
            public ChatOptions getOptions() { return ToolCallingChatOptions.builder().build(); }
        };
        var policy = mock(ExpertAnalysisPolicy.class);
        when(policy.allowedFacts()).thenReturn(Set.of("fixture.checked"));
        when(policy.rules(anyList())).thenReturn(new ExpertAnalysisPolicy.Rules(List.of(), List.of()));
        when(policy.judge(anyMap(), anyList(), anySet())).thenReturn(Map.of("blockedRules", List.of()));
        var resolver = new ExpertBehaviorCatalog(List.of(new ExpertBehaviorCatalog.Registration(SqlExpertAgentService.BINDING,
                "SQL Agent", policy, "agent", SqlExpertAgentService.TOOLS)), SqlExpertAgentService.BINDING);
        var handler = new CapabilityHandler() {
            public Set<String> capabilities() { return SqlExpertAgentService.TOOLS; }
            public NodeResult handle(CapabilityContext context) {
                calls.incrementAndGet();
                if (context.step().capability().equals("sql.parse")) context.analysis().put("parseStatus", context.input().isBlank() ? "missing" : "valid");
                else context.publish("fixture.checked", true);
                return new NodeResult(true, !context.step().capability().equals("sql.parse") && incomplete, "fixture", Map.of("evidence", "supplied-plan"));
            }
        };
        var service = new SqlExpertAgentService(() -> ChatClient.builder(model).build(), access,
                new CapabilityHandlerRegistry(List.of(handler), name -> !switchedOff.get()), resolver, Path.of("."), duration);
        services.add(service); return service;
    }
    private SqlExpertAgentService.Request request() { return new SqlExpertAgentService.Request("select 1", "Why slow?", null, null); }
    private ChatResponse tool(String name, String args) {
        return new ChatResponse(List.of(new Generation(AssistantMessage.builder().content("")
                .toolCalls(List.of(new AssistantMessage.ToolCall(UUID.randomUUID().toString(), "function", name, args))).build())));
    }
    private ChatResponse finish() { return tool("finish_analysis", "{\"summary\":\"Evidence reviewed; performance remains unverified.\"}"); }

    @Test void springAiSelectsToolFromObservationsThenTerminatesAndPersistsVersionedEvidence() {
        var service = service(prompt -> {
            if (modelCalls.get() == 1) return tool("read_evidence", "{\"capability\":\"database.explain\"}");
            assertTrue(prompt.getInstructions().stream().filter(ToolResponseMessage.class::isInstance)
                    .map(ToolResponseMessage.class::cast).anyMatch(m -> m.getResponses().toString().contains("supplied-plan")));
            return finish();
        });
        var result = service.execute("fixture", UUID.randomUUID(), request());
        assertEquals("completed", result.status(), result.toString());
        assertEquals("unverified", result.verification());
        assertEquals(2, calls.get()); assertEquals(2, modelCalls.get());
        assertEquals(3, persisted.size());
        assertTrue(persisted.stream().allMatch(o -> o.metadata().get("behavior").equals(SqlExpertAgentService.BINDING)));
    }
    @Test void missingSqlAsksForInputWithoutModel() {
        var result = service(p -> { fail("No model without parse evidence"); return null; }).execute("fixture", UUID.randomUUID(),
                new SqlExpertAgentService.Request(null, "Help", null, null));
        assertEquals("needs-input", result.status()); assertEquals(0, modelCalls.get());
    }
    @Test void modelCanRequestSpecificMissingEvidenceAndStopWithoutAnotherTurn() {
        var result = service(p -> tool("request_input", "{\"question\":\"Please supply a sanitized EXPLAIN JSON snapshot\"}"))
                .execute("fixture", UUID.randomUUID(), request());
        assertEquals("needs-input", result.status()); assertEquals(1, modelCalls.get());
    }
    @Test void incompleteEvidenceCannotBecomeCompletedByModelDecision() {
        var result = service(p -> modelCalls.get() == 1 ? tool("read_evidence", "{\"capability\":\"database.explain\"}") : finish(), Duration.ofSeconds(5), true)
                .execute("fixture", UUID.randomUUID(), request());
        assertEquals("partial", result.status());
    }
    @Test void unauthorizedToolOrExtraArgumentsNeverReachHandler() {
        for (String args : List.of("{\"capability\":\"git-status\"}", "{\"capability\":\"database.explain\",\"sql\":\"delete from users\"}")) {
            int before = calls.get();
            var result = service(p -> tool("read_evidence", args)).execute("fixture", UUID.randomUUID(), request());
            assertEquals("failed", result.status()); assertEquals(before + 1, calls.get());
        }
    }
    @Test void repeatedReadStopsInsteadOfLoopingOrRetrying() {
        var result = service(p -> tool("read_evidence", "{\"capability\":\"database.explain\"}"))
                .execute("fixture", UUID.randomUUID(), request());
        assertEquals("failed", result.status()); assertEquals("AGENT_REPEATED_TOOL", result.error());
        assertEquals(2, calls.get()); assertEquals(2, modelCalls.get());
    }
    @Test void inventedToolCannotResolveToGlobalBeanOrClaimSuccess() {
        var result = service(p -> tool("execute_sql", "{}" )).execute("fixture", UUID.randomUUID(), request());
        assertEquals("failed", result.status()); assertEquals(1, calls.get());
    }
    @Test void revocationWhileModelRunsBlocksToolAndNextModelTurn() {
        var result = service(p -> { revoked.set(true); return tool("read_evidence", "{\"capability\":\"database.explain\"}"); })
                .execute("fixture", UUID.randomUUID(), request());
        assertEquals("failed", result.status()); assertEquals(1, calls.get()); assertEquals(1, modelCalls.get());
    }
    @Test void freeTextAndOversizedOutputAreNotAcceptedAsVerifiedCompletion() {
        for (String text : List.of("Everything is proven safe", "x".repeat(17000))) {
            var result = service(p -> new ChatResponse(List.of(new Generation(new AssistantMessage(text)))))
                    .execute("fixture", UUID.randomUUID(), request());
            assertEquals("failed", result.status()); assertEquals("", result.summary());
        }
    }
    @Test void multiToolBatchRejectedBeforeAnyRequestedToolRuns() {
        var result = service(p -> new ChatResponse(List.of(new Generation(AssistantMessage.builder().content("")
                .toolCalls(List.of(new AssistantMessage.ToolCall("a", "function", "finish_analysis", "{\"summary\":\"done\"}"),
                        new AssistantMessage.ToolCall("b", "function", "read_evidence", "{\"capability\":\"database.explain\"}"))).build()))))
                .execute("fixture", UUID.randomUUID(), request());
        assertEquals("AGENT_BATCH_REJECTED", result.error()); assertEquals(1, calls.get());
    }
    @Test void timeoutReturnsBoundedFailureAndLateToolResponseCannotExecute() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        var service = service(p -> {
            entered.countDown();
            while (release.getCount() > 0) { try { release.await(10, TimeUnit.MILLISECONDS); } catch (InterruptedException ignored) { } }
            return tool("read_evidence", "{\"capability\":\"database.explain\"}");
        }, Duration.ofMillis(200), false);
        try {
            var result = service.execute("fixture", UUID.randomUUID(), request());
            assertEquals("timed-out", result.status()); assertEquals(0, entered.getCount()); assertEquals(1, calls.get());
        } finally { release.countDown(); }
    }
    @Test void cancellationIsScopedToExpertAndPersistsOnlyCancelledTerminal() throws Exception {
        var entered = new CountDownLatch(1);
        var service = service(p -> {
            entered.countDown();
            try { new CountDownLatch(1).await(); } catch (InterruptedException expected) { Thread.currentThread().interrupt(); }
            return finish();
        });
        var id = UUID.randomUUID();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var running = executor.submit(() -> service.execute("fixture", id, request()));
            assertTrue(entered.await(3, TimeUnit.SECONDS));
            assertFalse(service.cancel("other", id)); assertTrue(service.cancel("fixture", id));
            var result = running.get(3, TimeUnit.SECONDS);
            assertEquals("cancelled", result.status()); assertEquals("", result.summary());
        }
    }
    @Test void reusedExecutionIdDoesNotCallModelAgain() {
        var service = service(p -> finish()); var id = UUID.randomUUID();
        service.execute("fixture", id, request());
        assertThrows(RuntimeException.class, () -> service.execute("fixture", id, request()));
        assertEquals(1, modelCalls.get());
    }

    @Test void disabledEvidenceCapabilityInvalidatesLateModelCompletion() {
        var result = service(p -> { switchedOff.set(true); return finish(); }).execute("fixture", UUID.randomUUID(), request());
        assertEquals("failed", result.status()); assertEquals("AGENT_TOOL_UNAVAILABLE", result.error());
        assertEquals("", result.summary());
    }
    @Test void secretsAreRedactedBeforeModelAndBeforePersistedTerminalSummary() {
        var result = service(p -> {
            assertFalse(p.getInstructions().toString().contains("sk-private-input"));
            return tool("finish_analysis", "{\"summary\":\"token=private-output remains unverified\"}");
        }).execute("fixture", UUID.randomUUID(), new SqlExpertAgentService.Request("select 1", "Inspect sk-private-input", null, null));
        assertEquals("completed", result.status(), result.toString());
        assertFalse(result.toString().contains("private-output"));
        assertFalse(persisted.toString().contains("sk-private-input"));
    }
    @Test void accountPlanConnectionRemainsRejectedBeforeCreatingProviderClient() {
        var connections = mock(ModelConnections.class);
        var snapshot = new ModelConnectionSnapshot(UUID.randomUUID(), "fixture", ModelConnections.CHATGPT_KIND, true, "https://example.com", "fixture-model",
                "fixture-secret", 1, true, "revision", "responses");
        when(connections.effectiveDefault()).thenReturn(snapshot);
        assertEquals("AGENT_MODEL_TOOLS_UNSUPPORTED", assertThrows(RuntimeException.class,
                () -> SqlExpertAgentService.selectedClient(connections)).getMessage());
        verify(connections, never()).completionClient(any());
    }
    @Test void ordinaryResponsesConnectionUsesTheExistingCompletionClient() {
        var connections = mock(ModelConnections.class);
        var snapshot = new ModelConnectionSnapshot(UUID.randomUUID(), "fixture", ModelConnections.KIND, true, "https://example.com", "fixture-model",
                "fixture-secret", 1, true, "revision", "responses");
        var client = mock(org.springframework.ai.chat.client.ChatClient.class);
        when(connections.effectiveDefault()).thenReturn(snapshot);
        when(connections.completionClient(snapshot)).thenReturn(client);
        assertSame(client, SqlExpertAgentService.selectedClient(connections));
    }
}
