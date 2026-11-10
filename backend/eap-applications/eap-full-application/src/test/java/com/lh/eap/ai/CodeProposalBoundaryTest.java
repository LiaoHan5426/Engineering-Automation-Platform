package com.lh.eap.ai;
import com.lh.eap.delivery.CodeChangeService;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;

class CodeProposalBoundaryTest {
    @TempDir Path root;
    final InMemoryCodeGenerationStore generations = new InMemoryCodeGenerationStore();
    final InMemoryCodeProposalStore proposals = new InMemoryCodeProposalStore();
    final UUID conversation = UUID.randomUUID();
    CodeChangeService service() {
        return new CodeChangeService(new RuntimeWorkspace(root, root.toString()), null, null, generations, proposals);
    }
    CodeChangeService.Proposal proposal(boolean writable) {
        var service = service();
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "Page.vue", "", "");
        return service.proposePrepared(AiConversationRegistry.PRINCIPAL, conversation, snapshot.id(),
                "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", writable);
    }
    @Test void durableApplySurvivesServiceRecreationAndDoesNotRewriteOnReplay() throws Exception {
        Files.writeString(root.resolve("Page.vue"), "original");
        var proposal = proposal(true);
        var applied = service().apply(conversation, proposal.id(), true);
        assertEquals(List.of("Page.vue"), applied.written());
        assertEquals("candidate", Files.readString(root.resolve("Page.vue")));
        assertEquals("APPLIED", proposals.rows.get(proposal.id()).status());
        assertEquals("not_requested", applied.verification());
        assertTrue(applied.checks().isEmpty());
        Files.writeString(root.resolve("Page.vue"), "user edit after apply");
        assertEquals(applied, service().apply(conversation, proposal.id(), true));
        assertEquals("user edit after apply", Files.readString(root.resolve("Page.vue")));
    }
    @Test void preparedProposalRequiresDurableStore() {
        var service = new CodeChangeService(new RuntimeWorkspace(root, root.toString()), null, null,
                new InMemoryCodeGenerationStore());
        var conversation = UUID.randomUUID();
        var generation = service.prepareGeneration("operator", conversation, "Page.vue", "", "");
        var failure = assertThrows(ResponseStatusException.class, () -> service.proposePrepared("operator", conversation,
                generation.id(), "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", true));
        assertEquals("CODE_PROPOSAL_STORE_UNAVAILABLE", failure.getReason());
        assertFalse(Files.exists(root.resolve("Page.vue")));
    }
    @Test void nestedRepositoryCreatedAfterProposalCannotBeWritten() throws Exception {
        Files.createDirectories(root.resolve("nested"));
        Files.writeString(root.resolve("nested/Page.vue"), "original");
        var service = service();
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "nested/Page.vue", "", "");
        var proposal = service.proposePrepared(AiConversationRegistry.PRINCIPAL, conversation, snapshot.id(),
                "{\"files\":[{\"path\":\"nested/Page.vue\",\"content\":\"candidate\"}]}", true);
        Files.createDirectories(root.resolve("nested/.git"));
        assertEquals("CODE_NESTED_REPOSITORY", assertThrows(ResponseStatusException.class,
                () -> service.apply(conversation, proposal.id(), true)).getReason());
        assertEquals("original", Files.readString(root.resolve("nested/Page.vue")));
        assertEquals("FAILED", proposals.rows.get(proposal.id()).status());
    }
    @Test void restartMarksOnlyInterruptedApplicationsUnknownAndNeverRetries() throws Exception {
        var proposal = proposal(true);
        assertTrue(proposals.claim(AiConversationRegistry.PRINCIPAL, conversation, proposal.id()));
        assertDoesNotThrow(() -> service().recoverInterruptedApplications());
        assertEquals("UNKNOWN", service().proposal(AiConversationRegistry.PRINCIPAL, conversation, proposal.id()).status());
        assertEquals("CODE_APPLICATION_UNKNOWN", assertThrows(ResponseStatusException.class,
                () -> service().apply(conversation, proposal.id(), true)).getReason());
        assertFalse(Files.exists(root.resolve("Page.vue")));
    }
    @Test void failedResultPersistenceLeavesDurableInterlockAndDoesNotRollBackUserBytes() throws Exception {
        var failing = new InMemoryCodeProposalStore() {
            @Override public void finish(String p, UUID c, UUID id, String status, CodeChangeService.Applied result, String reason) {
                throw new IllegalStateException("injected database unavailable");
            }
        };
        var service = new CodeChangeService(new RuntimeWorkspace(root, root.toString()), null, null, generations, failing);
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "Page.vue", "", "");
        var saved = service.proposePrepared(AiConversationRegistry.PRINCIPAL, conversation, snapshot.id(),
                "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", true);
        assertEquals("CODE_APPLICATION_UNKNOWN", assertThrows(ResponseStatusException.class,
                () -> service.apply(conversation, saved.id(), true)).getReason());
        assertEquals("candidate", Files.readString(root.resolve("Page.vue")));
        assertEquals("APPLYING", failing.rows.get(saved.id()).status());
        Files.writeString(root.resolve("Page.vue"), "later edit");
        assertEquals("CODE_APPLICATION_APPLYING", assertThrows(ResponseStatusException.class,
                () -> service.apply(conversation, saved.id(), true)).getReason());
        assertEquals("later edit", Files.readString(root.resolve("Page.vue")));
    }
    @Test void staleAbsentCreatedReadonlyAndScopeChecksNeverWrite() throws Exception {
        var proposal = proposal(true);
        assertEquals("WRITE_CONFIRMATION_REQUIRED", assertThrows(ResponseStatusException.class,
                () -> service().apply(conversation, proposal.id(), false)).getReason());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service().apply("wrong", conversation, proposal.id(), true)).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service().apply(UUID.randomUUID(), proposal.id(), true)).getStatusCode().value());
        Files.writeString(root.resolve("Page.vue"), "user created");
        assertEquals("FILE_CHANGED_SINCE_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> service().apply(conversation, proposal.id(), true)).getReason());
        assertEquals("FAILED", proposals.rows.get(proposal.id()).status());
        assertEquals("user created", Files.readString(root.resolve("Page.vue")));
        var readonly = proposal(false);
        assertEquals("READ_ONLY_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> service().apply(conversation, readonly.id(), true)).getReason());
        assertEquals("PROPOSED", proposals.rows.get(readonly.id()).status());
    }
    @Test void legacyProductionApplyCannotUseAnUnpreparedInMemoryCandidate() {
        var service = service();
        var legacy = service.propose(conversation, "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}");
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service.apply(conversation, legacy.id(), true)).getStatusCode().value());
        assertFalse(Files.exists(root.resolve("Page.vue")));
    }
    @Test void moveFailureIsUnknownNotSuccessfulOrAutomaticallyRetried() throws Exception {
        Files.writeString(root.resolve("Page.vue"), "original");
        var saved = proposal(true);
        var target = root.resolve("Page.vue").toRealPath();
        try (var files = org.mockito.Mockito.mockStatic(Files.class, org.mockito.Mockito.CALLS_REAL_METHODS)) {
            files.when(() -> Files.move(org.mockito.ArgumentMatchers.any(Path.class), org.mockito.ArgumentMatchers.eq(target),
                    org.mockito.ArgumentMatchers.eq(StandardCopyOption.ATOMIC_MOVE), org.mockito.ArgumentMatchers.eq(StandardCopyOption.REPLACE_EXISTING)))
                    .thenThrow(new AtomicMoveNotSupportedException("fixture", "fixture", "injected unsupported atomic replacement"));
            assertEquals("CODE_APPLICATION_UNKNOWN", assertThrows(ResponseStatusException.class,
                    () -> service().apply(conversation, saved.id(), true)).getReason());
        }
        assertEquals("UNKNOWN", proposals.rows.get(saved.id()).status());
        assertEquals("original", Files.readString(root.resolve("Page.vue")));
    }
    @Test void productionReadbackDoesNotUseAnUnboundedWholeFileRead() throws Exception {
        var saved = proposal(true);
        try (var files = org.mockito.Mockito.mockStatic(Files.class, org.mockito.Mockito.CALLS_REAL_METHODS)) {
            files.when(() -> Files.readString(org.mockito.ArgumentMatchers.any(Path.class), org.mockito.ArgumentMatchers.eq(java.nio.charset.StandardCharsets.UTF_8)))
                    .thenThrow(new java.io.IOException("unbounded read forbidden in production apply"));
            assertEquals("APPLIED", assertDoesNotThrow(() -> service().apply(conversation, saved.id(), true)).status());
        }
    }
    @Test void publicStatusIsReadOnlyScopedAndExpiredConversationDoesNotReopenIt() throws Exception {
        var fixture = new AiChatApplicationTest(); fixture.root = root;
        var app = fixture.app(prompt -> FakeChatModels.text("unused"), true, root, null);
        org.springframework.test.util.ReflectionTestUtils.setField(app, "codeChanges", service());
        var id = app.open("{}").conversationId();
        var generation = service().prepareGeneration(AiConversationRegistry.PRINCIPAL, id, "Page.vue", "", "");
        var saved = service().proposePrepared(AiConversationRegistry.PRINCIPAL, id, generation.id(),
                "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", true);
        var mvc = fixture.mvc(app);
        String url = "/api/ai/conversations/" + id + "/proposals/" + saved.id();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value("PROPOSED"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.proposal.id").value(saved.id().toString()));
        assertFalse(Files.exists(root.resolve("Page.vue")));
        var other = app.open("{}").conversationId();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(
                "/api/ai/conversations/" + other + "/proposals/" + saved.id()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        app.deleteConversation(id);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        assertTrue(proposals.rows.containsKey(saved.id()));
    }
    @Test void operatorRefusalIsPersistedAndBlocksApply() throws Exception {
        var fixture = new AiChatApplicationTest(); fixture.root = root;
        var app = fixture.app(prompt -> FakeChatModels.text("unused"), true, root, null);
        org.springframework.test.util.ReflectionTestUtils.setField(app, "codeChanges", service());
        var id = app.open("{}").conversationId();
        var generation = service().prepareGeneration(AiConversationRegistry.PRINCIPAL, id, "Page.vue", "", "");
        var saved = service().proposePrepared(AiConversationRegistry.PRINCIPAL, id, generation.id(),
                "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", true);
        var mvc = fixture.mvc(app);
        String url = "/api/ai/conversations/" + id + "/proposals/" + saved.id();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url + "/refuse")
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value("REFUSED"));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.status").value("REFUSED"));
        assertEquals("REFUSED", proposals.rows.get(saved.id()).status());
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service().apply(id, saved.id(), true));
    }
}
