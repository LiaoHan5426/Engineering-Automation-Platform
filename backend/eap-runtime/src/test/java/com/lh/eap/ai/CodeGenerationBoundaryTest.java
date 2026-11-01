package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class CodeGenerationBoundaryTest {
    @TempDir Path root;
    private final InMemoryCodeGenerationStore store = new InMemoryCodeGenerationStore();
    private CodeChangeService changes(CodeGenerationStore adapter) {
        return new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""), null, null, adapter);
    }
    private AiChatApplication app(ChatModel model, CodeChangeService changes) {
        var fixture = new AiChatApplicationTest(); fixture.root = root;
        var app = fixture.app(model, true, root, null);
        ReflectionTestUtils.setField(app, "codeChanges", changes);
        return app;
    }
    private String request(String target) {
        return JsonMapper.builder().build().writeValueAsString(Map.of("message", "edit", "toolMode", "none",
                "context", Map.of("mode", "code", "targetPath", target)));
    }
    private String answer(String path) {
        return JsonMapper.builder().build().writeValueAsString(Map.of("files", List.of(Map.of("path", path, "content", "candidate"))));
    }
    @Test void storedFullSourceIsTheModelBasisAndApplyStillConflictsOnThatBasis() throws Exception {
        String original = "const text = '" + "界".repeat(2000) + "';\r\n// end-marker";
        Files.writeString(root.resolve("Page.vue"), original);
        var service = changes(store);
        var app = app(prompt -> {
            assertEquals(1, store.rows.size()); // committed/prepared before the first model call
            var saved = store.rows.values().iterator().next();
            assertEquals(original, saved.source());
            assertTrue(prompt.getUserMessage().getText().contains(saved.source()));
            assertTrue(prompt.getUserMessage().getText().contains(saved.baseHash()));
            return FakeChatModels.text(answer("Page.vue"));
        }, service);
        var id = app.open("{}").conversationId();
        var proposal = app.send(id, request("Page.vue")).proposal();
        var saved = store.rows.get(proposal.generation().id());
        assertEquals(id, saved.conversationId());
        assertEquals(AiConversationRegistry.PRINCIPAL, saved.principal());
        assertEquals(root.toRealPath().toString(), saved.workspace());
        assertEquals(original, proposal.files().getFirst().before());
        assertEquals(saved.reference(), proposal.generation());
        assertEquals(saved.baseHash(), proposal.files().getFirst().baseHash());
        var json = JsonMapper.builder().build().readTree(JsonMapper.builder().build().writeValueAsString(proposal));
        assertFalse(json.path("generation").has("source"));
        Files.writeString(root.resolve("Page.vue"), "later user edit");
        assertEquals("FILE_CHANGED_SINCE_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> app.apply(id, proposal.id(), "{\"confirmed\":true}")).getReason());
        assertEquals(original, store.find(saved.id()).orElseThrow().source());
    }
    @Test void completeCodeResponseBeyondChatLimitRemainsAValidProposal() throws Exception {
        String original = "// " + "x".repeat(23000) + "\n// original-end";
        Files.writeString(root.resolve("Page.vue"), original);
        String candidate = original + "\n// candidate-end";
        String json = JsonMapper.builder().build().writeValueAsString(
                Map.of("files", List.of(Map.of("path", "Page.vue", "content", candidate))));
        assertTrue(json.length() > 16384);
        var calls = new AtomicInteger();
        var app = app(prompt -> { calls.incrementAndGet(); return FakeChatModels.text(json); }, changes(store));
        var id = app.open("{}").conversationId();
        var response = assertDoesNotThrow(() -> app.send(id, request("Page.vue")));
        assertEquals("", response.error());
        assertEquals(candidate, response.proposal().files().getFirst().content());
        assertEquals(original, response.proposal().files().getFirst().before());
        assertEquals(original, Files.readString(root.resolve("Page.vue")));
        assertEquals(1, calls.get());
    }
    @Test void oversizedCodeResponseIsAnExplicitFailureWithoutPartialAnswerOrProposal() {
        String json = JsonMapper.builder().build().writeValueAsString(Map.of("summary", "x".repeat(1000000),
                "files", List.of(Map.of("path", "Page.vue", "content", "candidate"))));
        var calls = new AtomicInteger();
        var app = app(prompt -> { calls.incrementAndGet(); return FakeChatModels.text(json); }, changes(store));
        var id = app.open("{}").conversationId();
        var response = assertDoesNotThrow(() -> app.send(id, request("Page.vue")));
        assertEquals("CODE_PROPOSAL_TOO_LARGE", response.error());
        assertEquals("FAILED", response.status());
        assertEquals("", response.answer());
        assertNull(response.proposal());
        assertFalse(Files.exists(root.resolve("Page.vue")));
        assertEquals(1, calls.get());
    }
    @Test void decodedProposalLimitStillAllowsJsonEscapingAndRejectsOneExtraCharacter() {
        String candidate = String.valueOf((char) 1).repeat(160000);
        String json = JsonMapper.builder().build().writeValueAsString(
                Map.of("files", List.of(Map.of("path", "Page.vue", "content", candidate))));
        var app = app(prompt -> FakeChatModels.text(json), changes(store));
        var id = app.open("{}").conversationId();
        assertEquals(candidate, app.send(id, request("Page.vue")).proposal().files().getFirst().content());

        String oversized = JsonMapper.builder().build().writeValueAsString(
                Map.of("files", List.of(Map.of("path", "Page.vue", "content", "x".repeat(160001)))));
        var oversizedApp = app(prompt -> FakeChatModels.text(oversized), changes(store));
        var otherId = oversizedApp.open("{}").conversationId();
        var failure = assertThrows(ResponseStatusException.class, () -> oversizedApp.send(otherId, request("Page.vue")));
        assertEquals("CODE_PROPOSAL_TOO_LARGE", failure.getReason());
        assertEquals(400, failure.getStatusCode().value());
    }
    @Test void directProposalAdmissionAlsoRejectsOversizedEnvelope() {
        String json = JsonMapper.builder().build().writeValueAsString(Map.of("summary", "x".repeat(1000000),
                "files", List.of(Map.of("path", "Page.vue", "content", "candidate"))));
        var failure = assertThrows(ResponseStatusException.class,
                () -> changes(store).propose(UUID.randomUUID(), json));
        assertEquals("CODE_PROPOSAL_TOO_LARGE", failure.getReason());
        assertEquals(400, failure.getStatusCode().value());
    }
    @Test void absentThenCreatedDuringModelIsAConflict() {
        var app = app(prompt -> {
            assertNull(store.rows.values().iterator().next().source());
            try { Files.writeString(root.resolve("Page.vue"), "created during model"); }
            catch (java.io.IOException failure) { throw new java.io.UncheckedIOException(failure); }
            return FakeChatModels.text(answer("Page.vue"));
        }, changes(store));
        var id = app.open("{}").conversationId();
        assertEquals("CODE_GENERATION_BASELINE_CHANGED", assertThrows(ResponseStatusException.class,
                () -> app.send(id, request("Page.vue"))).getReason());
    }
    @Test void onlyExactSingleTargetAndOriginalIdentityAreAccepted() {
        var service = changes(store); var id = UUID.randomUUID();
        var saved = service.prepareGeneration("operator", id, "Page.vue", "", "");
        for (String json : List.of(answer("Other.vue"), "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"x\"},{\"path\":\"Other.vue\",\"content\":\"y\"}]}")) {
            assertEquals("CODE_GENERATION_SCOPE_MISMATCH", assertThrows(ResponseStatusException.class,
                    () -> service.proposePrepared("operator", id, saved.id(), json, true)).getReason());
        }
        assertEquals("CODE_GENERATION_SCOPE_MISMATCH", assertThrows(ResponseStatusException.class,
                () -> service.proposePrepared("forged", id, saved.id(), answer("Page.vue"), true)).getReason());
        assertEquals("CODE_GENERATION_SCOPE_MISMATCH", assertThrows(ResponseStatusException.class,
                () -> service.proposePrepared("operator", UUID.randomUUID(), saved.id(), answer("Page.vue"), true)).getReason());
        assertNotNull(service.proposePrepared("operator", id, saved.id(), answer("Page.vue"), false).generation());
    }
    @Test void missingDeniedIncompleteAndSecretContextNeverCallsModel() throws Exception {
        var calls = new AtomicInteger();
        var app = app(prompt -> { calls.incrementAndGet(); return FakeChatModels.text(answer("Page.vue")); }, changes(store));
        var id = app.open("{}").conversationId();
        assertEquals("CODE_GENERATION_TARGET_REQUIRED", assertThrows(ResponseStatusException.class,
                () -> app.send(id, request(""))).getReason());
        for (String path : List.of("credentials.json", "secrets.ts", "config/token.json", ".env", "package.json")) {
            assertThrows(ResponseStatusException.class, () -> app.send(id, request(path)), path);
        }
        for (String source : List.of("x".repeat(24001), "const password = 'private';", "// [REDACTED]", "-----BEGIN PRIVATE KEY-----")) {
            Files.writeString(root.resolve("Page.vue"), source);
            assertEquals("CODE_GENERATION_CONTEXT_UNAVAILABLE", assertThrows(ResponseStatusException.class,
                    () -> app.send(id, request("Page.vue"))).getReason());
        }
        Files.write(root.resolve("Page.vue"), new byte[] {(byte) 0xc3, 0x28});
        assertEquals("CODE_GENERATION_CONTEXT_UNAVAILABLE", assertThrows(ResponseStatusException.class,
                () -> app.send(id, request("Page.vue"))).getReason());
        assertEquals(0, calls.get()); assertTrue(store.rows.isEmpty());
    }
    @Test void methodArgumentCredentialIsRejectedBeforeSnapshotOrModelCall() throws Exception {
        Files.writeString(root.resolve("Client.java"),
                "var client = OpenAI.builder().apiKey(\"sk-proj-synthetic-not-a-real-credential\").build();");
        var calls = new AtomicInteger();
        var app = app(prompt -> { calls.incrementAndGet(); return FakeChatModels.text(answer("Client.java")); }, changes(store));
        var id = app.open("{}").conversationId();
        var failure = assertThrows(ResponseStatusException.class, () -> app.send(id, request("Client.java")));
        assertEquals("CODE_GENERATION_CONTEXT_UNAVAILABLE", failure.getReason());
        assertEquals(503, failure.getStatusCode().value());
        assertEquals(0, calls.get());
        assertTrue(store.rows.isEmpty());
    }
    @Test void whitespaceSourceIsNotSilentlyDroppedFromModelContext() throws Exception {
        String original = " \t\r\n  ";
        Files.writeString(root.resolve("Page.vue"), original);
        var app = app(prompt -> {
            assertTrue(prompt.getUserMessage().getText().contains(">\n" + original + "\n</workspace-source>"));
            return FakeChatModels.text(answer("Page.vue"));
        }, changes(store));
        var id = app.open("{}").conversationId();
        assertNotNull(app.send(id, request("Page.vue")).proposal().generation());
    }
    @Test void incompletePrototypeReferenceIsNotPersisted() {
        var service = changes(store);
        assertEquals("CODE_GENERATION_CONTEXT_UNAVAILABLE", assertThrows(ResponseStatusException.class,
                () -> service.prepareGeneration("operator", UUID.randomUUID(), "Page.vue", UUID.randomUUID().toString(), "")).getReason());
        assertTrue(store.rows.isEmpty());
    }
    @Test void unavailablePersistenceHasNoImplicitInMemoryFallback() {
        var calls = new AtomicInteger();
        for (CodeGenerationStore adapter : Arrays.asList(null, new CodeGenerationStore() {
            public void save(Snapshot snapshot) { throw new IllegalStateException("offline database"); }
            public Optional<Snapshot> find(UUID id) { return Optional.empty(); }
        })) {
            var app = app(prompt -> { calls.incrementAndGet(); return FakeChatModels.text(answer("Page.vue")); }, changes(adapter));
            var id = app.open("{}").conversationId();
            assertEquals("CODE_GENERATION_CONTEXT_UNAVAILABLE", assertThrows(ResponseStatusException.class,
                    () -> app.send(id, request("Page.vue"))).getReason());
        }
        assertEquals(0, calls.get());
    }
}
