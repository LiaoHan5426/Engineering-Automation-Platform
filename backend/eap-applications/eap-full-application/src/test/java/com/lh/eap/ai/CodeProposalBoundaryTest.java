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
    @Test void referenceSnapshotsAreCompleteBoundedAndNeverReserveGeneration() throws Exception {
        Files.writeString(root.resolve("Host.ts"), "export const route = '#/detail'\n");
        var service = service();
        var references = service.inspectReferences(List.of("Host.ts"));
        assertEquals(Files.readString(root.resolve("Host.ts")), references.getFirst().excerpt());
        assertEquals(Files.size(root.resolve("Host.ts")), references.getFirst().bytes());
        assertTrue(proposals.rows.isEmpty());
        assertEquals("CODE_GRAPH_TARGETS_INVALID", assertThrows(ResponseStatusException.class,
                () -> service.inspectReferences(List.of("Host.ts", "Host.ts"))).getReason());
        Files.writeString(root.resolve("Large.ts"), "x".repeat(16001));
        assertEquals("CODE_GRAPH_CONTEXT_TOO_LARGE", assertThrows(ResponseStatusException.class,
                () -> service.inspectReferences(List.of("Large.ts"))).getReason());
        Files.writeString(root.resolve("One.ts"), "x".repeat(13000));
        Files.writeString(root.resolve("Two.ts"), "x".repeat(13000));
        assertEquals("CODE_GRAPH_CONTEXT_TOO_LARGE", assertThrows(ResponseStatusException.class,
                () -> service.inspectReferences(List.of("One.ts", "Two.ts"))).getReason());
        Files.writeString(root.resolve("Sensitive.ts"), "const authorization = 'Bearer abcdefghijklmnop';");
        assertThrows(ResponseStatusException.class, () -> service.inspectReferences(List.of("Sensitive.ts")));
        assertThrows(ResponseStatusException.class, () -> service.inspectReferences(List.of("missing.ts")));
        assertThrows(ResponseStatusException.class, () -> service.inspectReferences(List.of("../Host.ts")));
        var denied = new CodeChangeService(new RuntimeWorkspace(root, root.resolve("absent").toString()));
        assertThrows(ResponseStatusException.class, () -> denied.inspectReferences(List.of("Host.ts")));
    }
    @Test void preparationReadsTheSameCompleteSourcesAsGenerationWithoutCreatingIntent() throws Exception {
        Files.createDirectories(root.resolve("frontend"));
        Files.writeString(root.resolve("frontend/Form.vue"), "<template><p>Task</p></template>");
        Files.writeString(root.resolve("frontend/copy.json"), "{\"name\":\"Task\"}");
        var service = service();
        var result = service.inspectPreparation("frontend/Form.vue", List.of("frontend/copy.json", "frontend/form.css"));
        assertEquals(List.of(true, true, false), result.files().stream().map(CodeChangeService.PreparationFile::exists).toList());
        assertEquals("absent", result.files().getLast().baseHash());
        assertTrue(proposals.rows.isEmpty());
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation,
                "frontend/Form.vue", "", "", null, List.of("frontend/copy.json", "frontend/form.css"));
        assertEquals(snapshot.sources().stream().map(file -> file.baseHash()).toList(),
                result.files().stream().map(CodeChangeService.PreparationFile::baseHash).toList());
        assertEquals("CODE_GRAPH_TARGETS_INVALID", assertThrows(ResponseStatusException.class,
                () -> service.inspectPreparation("frontend/Form.vue", List.of("frontend/Form.vue"))).getReason());
        Files.writeString(root.resolve("frontend/copy.json"), "x".repeat(24001));
        assertThrows(ResponseStatusException.class, () -> service.inspectPreparation("frontend/Form.vue", List.of("frontend/copy.json")));
        var denied = new CodeChangeService(new RuntimeWorkspace(root, root.resolve("absent").toString()));
        assertThrows(ResponseStatusException.class, () -> denied.inspectPreparation("frontend/Form.vue", List.of()));
    }
    @Test void discoversBoundedDependenciesUsingProposalSyntaxWithoutIntent() throws Exception {
        Files.createDirectories(root.resolve("frontend"));
        Files.writeString(root.resolve("frontend/Page.vue"), "<script setup>import './style.css'; const page = () => import('./Detail.vue')</script>");
        Files.writeString(root.resolve("frontend/Detail.vue"), "<script setup>import copy from './copy.json'</script>");
        Files.writeString(root.resolve("frontend/style.css"), "p {color: red}");
        Files.writeString(root.resolve("frontend/copy.json"), "{\"title\":\"Detail\"}");
        var result = service().inspectDependencies("frontend/Page.vue");
        assertEquals(Set.of("frontend/Page.vue", "frontend/Detail.vue", "frontend/style.css", "frontend/copy.json"),
                new HashSet<>(result.files().stream().map(CodeChangeService.PreparationFile::path).toList()));
        assertTrue(proposals.rows.isEmpty());
        Files.writeString(root.resolve("frontend/Detail.vue"), "<script>import './Page.vue'</script>");
        assertEquals("CODE_GRAPH_CYCLE", assertThrows(ResponseStatusException.class,
                () -> service().inspectDependencies("frontend/Page.vue")).getReason());
        Files.writeString(root.resolve("frontend/Detail.vue"), "<script>import './missing.vue'</script>");
        assertEquals("CODE_GRAPH_UNDECLARED_IMPORT", assertThrows(ResponseStatusException.class,
                () -> service().inspectDependencies("frontend/Page.vue")).getReason());
    }
    @Test void dependencyDiscoveryRejectsCyclesAmbiguityAndExcessiveScope() throws Exception {
        Files.createDirectories(root.resolve("frontend"));
        Files.writeString(root.resolve("frontend/Page.ts"), "import './Page.ts'");
        assertEquals("CODE_GRAPH_CYCLE", assertThrows(ResponseStatusException.class,
                () -> service().inspectDependencies("frontend/Page.ts")).getReason());
        Files.writeString(root.resolve("frontend/Page.ts"), "import './copy'");
        Files.writeString(root.resolve("frontend/copy.ts"), "export const title='a'");
        Files.writeString(root.resolve("frontend/copy.js"), "export const title='b'");
        assertEquals("CODE_GRAPH_UNDECLARED_IMPORT", assertThrows(ResponseStatusException.class,
                () -> service().inspectDependencies("frontend/Page.ts")).getReason());
        var imports = new StringBuilder();
        for (int i = 0; i < 8; i++) {
            imports.append("import './file").append(i).append(".ts';\n");
            Files.writeString(root.resolve("frontend/file" + i + ".ts"), "export const x=1");
        }
        Files.writeString(root.resolve("frontend/Page.ts"), imports);
        assertEquals("CODE_GRAPH_TARGETS_INVALID", assertThrows(ResponseStatusException.class,
                () -> service().inspectDependencies("frontend/Page.ts")).getReason());
    }
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
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
            "[REDACTED]", "[redacted private key]", "«REDACTED»", "\\u005bREDACTED\\u005d"})
    void decodedRedactionMarkersNeverBecomeCandidates(String marker) throws Exception {
        Files.writeString(root.resolve("Page.vue"), "original");
        var service = service();
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "Page.vue", "", "");
        String answer = "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"" + marker + "\"}]}";
        var failure = assertThrows(ResponseStatusException.class, () -> service.proposePrepared(
                AiConversationRegistry.PRINCIPAL, conversation, snapshot.id(), answer, true));
        assertEquals(400, failure.getStatusCode().value());
        assertEquals("INVALID_CODE_PROPOSAL", failure.getReason());
        assertEquals("INVALID_CODE_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> service.propose(conversation, answer)).getReason());
        assertTrue(proposals.rows.isEmpty());
        assertEquals("original", Files.readString(root.resolve("Page.vue")));
    }
    @Test void redactedCompanionRejectsTheWholeCandidateBeforePersistence() throws Exception {
        Files.createDirectory(root.resolve("frontend"));
        Files.writeString(root.resolve("frontend/Page.vue"), "original page");
        Files.writeString(root.resolve("frontend/style.css"), "original style");
        var service = service();
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation,
                "frontend/Page.vue", "", "", null, List.of("frontend/style.css"));
        String answer = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(Map.of("files", List.of(
                Map.of("path", "frontend/Page.vue", "content", "<script setup>import './style.css'</script>"),
                Map.of("path", "frontend/style.css", "content", "/* [REDACTED] */"))));
        var failure = assertThrows(ResponseStatusException.class, () -> service.proposePrepared(
                AiConversationRegistry.PRINCIPAL, conversation, snapshot.id(), answer, true));
        assertEquals(400, failure.getStatusCode().value());
        assertEquals("INVALID_CODE_PROPOSAL", failure.getReason());
        assertTrue(proposals.rows.isEmpty());
        assertEquals("original page", Files.readString(root.resolve("frontend/Page.vue")));
        assertEquals("original style", Files.readString(root.resolve("frontend/style.css")));
    }
    @Test void ordinaryEpochSourceIsPreservedExactlyThroughProposalAndConfirmedApply() throws Exception {
        Files.writeString(root.resolve("Page.vue"), "original");
        String content = "<script setup lang=\"ts\">\nlet requestEpoch = 1\nconst capturedEpoch = requestEpoch\n"
                + "if (capturedEpoch === requestEpoch) requestEpoch++\n"
                + "if (capturedEpoch !== requestEpoch) requestEpoch++\n</script>\n<template><p>Ready</p></template>\n";
        var service = service();
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "Page.vue", "", "");
        String answer = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(
                Map.of("files", List.of(Map.of("path", "Page.vue", "content", content))));
        var candidate = service.proposePrepared(AiConversationRegistry.PRINCIPAL, conversation, snapshot.id(), answer, true);
        assertEquals(content, candidate.files().getFirst().content());
        assertEquals("original", Files.readString(root.resolve("Page.vue")));
        assertEquals("APPLIED", service.apply(conversation, candidate.id(), true).status());
        assertEquals(content, Files.readString(root.resolve("Page.vue")));
    }
    @Test void tokenSourceSurvivesApplyAndNextGenerationWithoutWeakeningSecretAdmission() throws Exception {
        Files.writeString(root.resolve("Page.vue"), "original");
        String content = "<script setup>const token = epoch;\r\nif (token === epoch) refresh();</script>";
        var service = service();
        var snapshot = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "Page.vue", "", "");
        String answer = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(
                Map.of("files", List.of(Map.of("path", "Page.vue", "content", content))));
        var candidate = service.proposePrepared(AiConversationRegistry.PRINCIPAL, conversation, snapshot.id(), answer, true);
        assertEquals(content, proposals.rows.get(candidate.id()).proposal().files().getFirst().content());
        assertEquals("APPLIED", service.apply(conversation, candidate.id(), true).status());
        assertEquals(content, Files.readString(root.resolve("Page.vue")));
        var next = service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "Page.vue", "", "");
        assertEquals(content, next.source());
        assertEquals(content, service.inspectReferences(List.of("Page.vue")).getFirst().excerpt());
        for (String secret : List.of("const token = 'fixture-secret';", "token=epoch", "Authorization: Bearer fixture-secret")) {
            Files.writeString(root.resolve("Page.vue"), secret);
            assertEquals("CODE_GENERATION_CONTEXT_UNAVAILABLE", assertThrows(ResponseStatusException.class,
                    () -> service.prepareGeneration(AiConversationRegistry.PRINCIPAL, conversation, "Page.vue", "", "")).getReason());
        }
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
