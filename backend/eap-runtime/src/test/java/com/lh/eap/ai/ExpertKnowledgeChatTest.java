package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;

class ExpertKnowledgeChatTest {
    @TempDir Path root;
    @Test void concurrentTurnCannotClearAnActiveKnowledgeTurnOrReplayItLater() throws Exception {
        var f = new ExpertKnowledgeContextServiceTest.Fixture();
        when(f.knowledge.searchAuthorized(anyString(), anyInt(), anyList())).thenReturn(List.of(evidence("concurrent-secret")));
        var entered = new java.util.concurrent.CountDownLatch(1); var release = new java.util.concurrent.CountDownLatch(1);
        var seen = new ArrayList<String>(); var h = helper();
        var app = h.app(p -> {
            seen.add(p.toString()); entered.countDown();
            try { assertTrue(release.await(5, java.util.concurrent.TimeUnit.SECONDS)); }
            catch (InterruptedException interrupted) { throw new AssertionError(interrupted); }
            return FakeChatModels.text("concurrent-derived");
        }, true, null, null);
        ReflectionTestUtils.setField(app, "expertKnowledge", f.service);
        var id = app.open("{}").conversationId();
        try (var pool = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var active = pool.submit(() -> app.send(id, SEND));
            assertTrue(entered.await(5, java.util.concurrent.TimeUnit.SECONDS));
            try {
                var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> app.send(id, PLAIN));
                assertEquals("CONVERSATION_BUSY", error.getReason());
                assertEquals("CONVERSATION_BUSY", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                        () -> app.deleteConversation(id)).getReason());
            } finally { release.countDown(); }
            assertEquals("", active.get(10, java.util.concurrent.TimeUnit.SECONDS).error());
        }
        app.send(id, PLAIN);
        assertEquals(2, seen.size());
        assertFalse(seen.getLast().contains("concurrent-secret"));
        assertFalse(seen.getLast().contains("concurrent-derived"));
    }
    @Test void authorizedKnowledgeRejectsGitEvenWhenGitIsAvailable() throws Exception {
        var f = new ExpertKnowledgeContextServiceTest.Fixture();
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        var toolCalls = new java.util.concurrent.atomic.AtomicInteger(); var h = helper();
        var app = h.app(p -> { calls.incrementAndGet(); return FakeChatModels.text("not called"); }, true, root, toolCalls);
        ReflectionTestUtils.setField(app, "expertKnowledge", f.service);
        assertEquals("no_matches", app.previewExpertContext(PREVIEW).status());
        assertEquals(true, app.status().tools().get("git_status"));
        var id = app.open("{}").conversationId();
        h.mvc(app).perform(post("/api/ai/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON)
                .content(SEND.replace("\"none\"", "\"git_status\"")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("EXPERT_CONTEXT_MODE_UNSUPPORTED"))
                .andExpect(jsonPath("$.knowledgeMemoryCleared").value(true));
        assertEquals(0, calls.get());
        assertEquals(0, toolCalls.get());
    }
    @Test void previewDoesNotGrantFutureSendOrCodeRights() {
        var f = new ExpertKnowledgeContextServiceTest.Fixture();
        var calls = new java.util.concurrent.atomic.AtomicInteger(); var h = helper();
        var app = h.app(p -> { calls.incrementAndGet(); return FakeChatModels.text("not called"); }, true, null, null);
        ReflectionTestUtils.setField(app, "expertKnowledge", f.service);
        assertEquals("no_matches", app.previewExpertContext(PREVIEW).status());
        when(f.experts.knowledgeGrants("expert-a")).thenReturn(List.of());
        var id = app.open("{}").conversationId();
        for (String request : List.of(SEND,
                SEND.replace("\"knowledgeExpertRef\"", "\"mode\":\"code\",\"knowledgeExpertRef\""),
                SEND.replace("\"revision\":2", "\"revision\":2,\"grants\":[\"forged\"]"))) {
            assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> app.send(id, request));
        }
        assertEquals(0, calls.get());
    }
    @Test void sendValidationPrecedesKnowledgeResolutionButFollowsIdentityParsing() {
        var f = new ExpertKnowledgeContextServiceTest.Fixture();
        var calls = new java.util.concurrent.atomic.AtomicInteger(); var h = helper();
        var app = h.app(p -> { calls.incrementAndGet(); return FakeChatModels.text("not called"); }, true, root, null);
        ReflectionTestUtils.setField(app, "expertKnowledge", f.service);
        var id = app.open("{}").conversationId();
        for (String request : List.of(
                SEND.replace("marker", " "),
                SEND.replace("\"marker\"", "1"),
                SEND.replace("marker", "x".repeat(32001)),
                SEND.replace("\"toolMode\":\"none\",", ""),
                SEND.replace("\"toolMode\":\"none\"", "\"toolMode\":null"),
                SEND.replace("marker", " ").replace("\"none\"", "\"git_status\""))) {
            for (String candidate : List.of(request, request.replace("\"revision\":2", "\"revision\":3"))) {
                var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> app.send(id, candidate));
                assertEquals("INVALID_CHAT_REQUEST", error.getReason());
                assertEquals(true, error.getBody().getProperties().get("knowledgeMemoryCleared"));
            }
        }
        for (String request : List.of(
                "{\"message\":\"\",\"toolMode\":\"git_status\",\"context\":{\"knowledgeExpertRef\":null}}",
                SEND.replace("marker", " ").replace("\"knowledgeExpertRef\"", "\"mode\":\"code\",\"knowledgeExpertRef\""))) {
            assertEquals("INVALID_EXPERT_CONTEXT", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> app.send(id, request)).getReason());
        }
        for (String query : List.of("\" \"", "1")) {
            assertEquals("INVALID_EXPERT_CONTEXT", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> app.previewExpertContext(PREVIEW.replace("\"marker\"", query))).getReason());
        }
        verifyNoInteractions(f.knowledge);
        assertEquals(0, calls.get());
    }
    static final String SEND = "{\"message\":\"marker\",\"toolMode\":\"none\",\"context\":{\"knowledgeExpertRef\":{\"id\":\"expert-a\",\"revision\":2}}}";
    static final String PREVIEW = "{\"query\":\"marker\",\"expertRef\":{\"id\":\"expert-a\",\"revision\":2}}";
    static final String PLAIN = "{\"message\":\"ordinary\",\"toolMode\":\"none\"}";
    AiChatApplicationTest helper() { var h = new AiChatApplicationTest(); h.root = root; return h; }
    static Map<String,Object> evidence(String text) {
        return Map.of("id", UUID.randomUUID(), "source", "source.md", "knowledgeBase", "A", "excerpt", text, "retrievalMode", "local-keyword");
    }
    @Test void rejectionClearsOldKnowledgeBeforeParsingOrCheckingRevokedAuthority() throws Exception {
        for (String refusal : List.of("revoked", "stale", "disabled", "capability", "forged", "null", "too-long", "database", "git")) {
            var f = new ExpertKnowledgeContextServiceTest.Fixture();
            when(f.knowledge.searchAuthorized(anyString(), anyInt(), anyList())).thenReturn(List.of(evidence("secret-old")));
            var seen = new ArrayList<String>(); var h = helper();
            var app = h.app(p -> { seen.add(p.toString()); return FakeChatModels.text("secret-derived"); }, true, root, null);
            ReflectionTestUtils.setField(app, "expertKnowledge", f.service);
            var id = app.open("{}").conversationId();
            app.send(id, SEND);
            String request = SEND;
            switch (refusal) {
                case "revoked" -> when(f.experts.knowledgeGrants("expert-a")).thenReturn(List.of());
                case "stale" -> when(f.definitions.lockForKnowledge("expert-a")).thenReturn(Optional.of(f.row(true, 3, "expert-a")));
                case "disabled" -> when(f.definitions.lockForKnowledge("expert-a")).thenReturn(Optional.of(f.row(false, 2, "expert-a")));
                case "capability" -> when(f.settings.enabled("knowledge.search")).thenReturn(false);
                case "forged" -> request = SEND.replace("\"revision\":2", "\"revision\":2,\"excerpt\":\"forged\"");
                case "null" -> request = "{\"message\":\"marker\",\"toolMode\":\"none\",\"context\":{\"knowledgeExpertRef\":null}}";
                case "too-long" -> request = SEND.replace("marker", "x".repeat(501));
                case "git" -> request = SEND.replace("\"none\"", "\"git_status\"");
                case "database" -> when(f.definitions.lockForKnowledge("expert-a")).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("private-db-detail"));
            }
            h.mvc(app).perform(post("/api/ai/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON).content(request))
                    .andExpect(status().is(org.hamcrest.Matchers.greaterThanOrEqualTo(400))).andExpect(jsonPath("$.knowledgeMemoryCleared").value(true));
            assertEquals(1, seen.size(), refusal);
            var conversations = (AiConversationRegistry) ReflectionTestUtils.getField(app, "conversations");
            var memory = (org.springframework.ai.chat.memory.ChatMemory) ReflectionTestUtils.getField(conversations, "memory");
            assertTrue(memory.get(EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL, id)).isEmpty(), refusal);
            app.send(id, PLAIN);
            assertFalse(seen.getLast().contains("secret-old"), refusal);
            assertFalse(seen.getLast().contains("secret-derived"), refusal);
        }
    }
    @Test void sendReadsFreshKnowledgeAsUserMaterialAndNeverReplaysItAfterRemoval() throws Exception {
        var f = new ExpertKnowledgeContextServiceTest.Fixture();
        var seen = new ArrayList<org.springframework.ai.chat.prompt.Prompt>();
        when(f.knowledge.searchAuthorized(anyString(), anyInt(), anyList())).thenReturn(List.of(evidence("old-secret")));
        var h = helper();
        var app = h.app(p -> { seen.add(p); return FakeChatModels.text("derived-sensitive-answer"); }, true, null, null);
        ReflectionTestUtils.setField(app, "expertKnowledge", f.service);
        h.mvc(app).perform(post("/api/ai/expert-context/preview").contentType(MediaType.APPLICATION_JSON).content(PREVIEW))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ready"))
                .andExpect(jsonPath("$.references[0].excerpt").value("old-secret"));
        assertTrue(seen.isEmpty());
        when(f.knowledge.searchAuthorized(anyString(), anyInt(), anyList())).thenReturn(List.of(evidence("fresh-secret")));
        var id = app.open("{}").conversationId();
        h.mvc(app).perform(post("/api/ai/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON).content(SEND))
                .andExpect(status().isOk()).andExpect(jsonPath("$.knowledgeContext.references[0].excerpt").value("fresh-secret"))
                .andExpect(jsonPath("$.knowledgeMemoryCleared").value(true));
        assertTrue(seen.getFirst().getUserMessage().getText().contains("fresh-secret"));
        assertFalse(seen.getFirst().getSystemMessage().getText().contains("fresh-secret"));
        assertFalse(seen.getFirst().toString().contains("old-secret"));
        h.mvc(app).perform(post("/api/ai/conversations/" + id + "/messages").contentType(MediaType.APPLICATION_JSON).content(PLAIN))
                .andExpect(status().isOk()).andExpect(jsonPath("$.knowledgeMemoryCleared").value(true))
                .andExpect(jsonPath("$.knowledgeContext").doesNotExist());
        assertFalse(seen.getLast().toString().contains("fresh-secret"));
        assertFalse(seen.getLast().toString().contains("derived-sensitive-answer"));
    }
}
