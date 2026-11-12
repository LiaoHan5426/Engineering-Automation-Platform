package com.lh.eap.ai;
import com.lh.eap.delivery.JdbcCodeGenerationStore;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.JdbcCodeProposalStore;
import com.lh.eap.delivery.CodeGenerationStore;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.BoardTaskService;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class CodeTaskBindingPersistenceTest extends CodeProposalPersistenceFixture {
    UUID taskId;
    UUID chatId;
    final String project = "prebound-test-" + UUID.randomUUID();
    @Test void modelConsumesCommittedTaskSnapshotAndRealFileApplyRetainsBinding() throws Exception {
        var tasks = new BoardTaskService(jdbc);
        var task = tasks.create(new BoardTaskService.Draft(project, "Saved task title", "", "ready", "Saved goal", "Saved criteria", UUID.randomUUID()));
        taskId = task.id();
        java.nio.file.Files.writeString(root.resolve("Page.vue"), "original");
        var fixture = new AiChatApplicationTest(); fixture.root = root;
        var app = fixture.app(prompt -> {
            assertTrue(prompt.getUserMessage().getText().contains("Saved goal"));
            assertTrue(prompt.getUserMessage().getText().contains("Saved criteria"));
            try (var connection = dataSource.getConnection(); var query = connection.prepareStatement("SELECT task_snapshot FROM eap.code_generation WHERE task_id=?")) {
                query.setObject(1, taskId);
                try (var rows = query.executeQuery()) { assertTrue(rows.next()); assertTrue(rows.getString(1).contains("Saved task title")); }
            } catch (java.sql.SQLException failure) { throw new IllegalStateException(failure); }
            return FakeChatModels.text("{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}");
        }, true, root, null);
        ReflectionTestUtils.setField(app, "codeChanges", service(store()));
        var id = app.open("{}").conversationId(); chatId = id;
        String request = JsonMapper.builder().build().writeValueAsString(Map.of("message", "edit", "toolMode", "none", "context",
                Map.of("mode", "code", "targetPath", "Page.vue", "taskRef", Map.of("projectId", project, "taskId", taskId.toString(), "revision", task.revision()))));
        var proposal = new TransactionTemplate(manager).execute(tx -> { var result = app.send(id, request).proposal(); tx.setRollbackOnly(); return result; });
        assertEquals(taskId.toString(), JsonMapper.builder().build().valueToTree(proposal).path("generation").path("taskBinding").path("taskId").asString());
        assertFalse(tasks.list(project).getFirst().executionActive());
        var applied = app.apply(id, proposal.id(), "{\"confirmed\":true}");
        assertEquals("APPLIED", applied.status());
        assertEquals("candidate", java.nio.file.Files.readString(root.resolve("Page.vue")));
        new TransactionTemplate(manager).executeWithoutResult(tx -> tasks.update(taskId,
                new BoardTaskService.Update(project, task.revision(), null, "later", null, null, null)));
        assertEquals(applied, app.apply(id, proposal.id(), "{\"confirmed\":true}"));
    }
    CodeChangeService.Proposal boundProposal() {
        var task = new BoardTaskService(jdbc).create(new BoardTaskService.Draft(project, "Bound task", "", "ready", "Goal", "Criteria", UUID.randomUUID()));
        taskId = task.id();
        var service = service(store());
        var snapshot = service.prepareGeneration(principal, conversation, "Page.vue", "", "", new com.lh.eap.api.TaskRef(project, taskId, task.revision()));
        return service.proposePrepared(principal, conversation, snapshot.id(), "{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}", true);
    }
    @Test void claimHoldingTaskLockMakesWaitingEditorObserveCommittedIntent() throws Exception {
        var proposal = boundProposal();
        var taskLocked = new java.util.concurrent.CountDownLatch(1); var release = new java.util.concurrent.CountDownLatch(1);
        var tasks = new BoardTaskService(jdbc);
        var binding = new com.lh.eap.application.service.BoardCodeTaskBinding(tasks, new com.lh.eap.persistence.mapper.JdbcPrototypeVersionStore(jdbc)) {
            @Override public void validateLocked(CodeGenerationStore.TaskSnapshot expected) {
                super.validateLocked(expected); taskLocked.countDown();
                try { assertTrue(release.await(5, java.util.concurrent.TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); }
            }
        };
        var claimant = new JdbcCodeProposalStore(jdbc, manager, new JdbcCodeGenerationStore(jdbc, manager), binding, com.lh.eap.application.service.ApplicationBaselineFixture.create(jdbc));
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var claim = pool.submit(() -> claimant.claim(principal, conversation, proposal.id()));
            assertTrue(taskLocked.await(5, java.util.concurrent.TimeUnit.SECONDS));
            var editorStarted = new java.util.concurrent.CountDownLatch(1);
            var editor = pool.submit(() -> {
                editorStarted.countDown();
                return assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new TransactionTemplate(manager).execute(tx ->
                        tasks.update(taskId, new BoardTaskService.Update(project, 1, null, "edit", null, null, null)))).getReason();
            });
            assertTrue(editorStarted.await(5, java.util.concurrent.TimeUnit.SECONDS));
            release.countDown();
            assertTrue(claim.get(10, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("BOARD_EXECUTION_ACTIVE", editor.get(10, java.util.concurrent.TimeUnit.SECONDS));
        } finally { release.countDown(); }
        assertEquals(1, tasks.list(project).getFirst().revision());
    }
    @Test void committedClaimAndUnknownBlockTaskEditingAndProjectListProjection() {
        var proposal = boundProposal(); var tasks = new BoardTaskService(jdbc);
        assertTrue(store().claim(principal, conversation, proposal.id()));
        for (String status : List.of("APPLYING", "UNKNOWN")) {
            assertTrue(tasks.list(project).getFirst().executionActive(), status);
            assertEquals("BOARD_EXECUTION_ACTIVE", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> new TransactionTemplate(manager).execute(tx -> tasks.update(taskId,
                            new BoardTaskService.Update(project, 1, null, "edited", null, null, null)))).getReason());
            if (status.equals("APPLYING")) store().recoverInterrupted(root.toAbsolutePath().toString());
        }
    }
    @Test void editorHoldingTaskLockWinsBeforeClaimAndClaimCannotUseStaleRevision() throws Exception {
        var proposal = boundProposal();
        var locked = new java.util.concurrent.CountDownLatch(1); var release = new java.util.concurrent.CountDownLatch(1);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var editor = pool.submit(() -> new TransactionTemplate(manager).execute(tx -> {
                var task = new BoardTaskService(jdbc).update(taskId, new BoardTaskService.Update(project, 1, null, null, null, "Changed goal", null));
                locked.countDown();
                try { assertTrue(release.await(5, java.util.concurrent.TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); }
                return task;
            }));
            assertTrue(locked.await(5, java.util.concurrent.TimeUnit.SECONDS));
            var claimStarted = new java.util.concurrent.CountDownLatch(1);
            var claim = pool.submit(() -> { claimStarted.countDown(); return assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> store().claim(principal, conversation, proposal.id())).getReason(); });
            assertTrue(claimStarted.await(5, java.util.concurrent.TimeUnit.SECONDS)); release.countDown();
            assertEquals(2, editor.get(10, java.util.concurrent.TimeUnit.SECONDS).revision());
            assertEquals("BOARD_REVISION_CONFLICT", claim.get(10, java.util.concurrent.TimeUnit.SECONDS));
        } finally { release.countDown(); }
        assertEquals("PROPOSED", store().find(principal, conversation, proposal.id()).orElseThrow().status());
        assertFalse(java.nio.file.Files.exists(root.resolve("Page.vue")));
    }
    @Test void originalTaskAndPrototypeAreRequiredAndGenerationCannotBeRetrofitted() throws Exception {
        var proposal = boundProposal();
        var changes = service(store());
        var ref = new com.lh.eap.api.TaskRef(project, taskId, 1);
        assertEquals("CODE_TASK_PROTOTYPE_MISMATCH", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> changes.prepareGeneration(principal, conversation, "Page.vue", UUID.randomUUID().toString(), "", ref)).getReason());
        assertEquals("BOARD_REVISION_CONFLICT", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> changes.prepareGeneration(principal, conversation, "Page.vue", "", "", new com.lh.eap.api.TaskRef(project, taskId, 2))).getReason());
        assertEquals("BOARD_TASK_NOT_FOUND", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> changes.prepareGeneration(principal, conversation, "Page.vue", "", "", new com.lh.eap.api.TaskRef("foreign", taskId, 1))).getReason());
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE eap.code_generation SET task_snapshot=NULL,task_id=NULL,task_revision=NULL,task_project_id=NULL WHERE id=?", proposal.generation().id()));
        var unbound = changes.prepareGeneration(principal, conversation, "Other.vue", "", "");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE eap.code_generation SET source_content='changed' WHERE id=?", unbound.id()));
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM eap.code_generation WHERE principal=?", Integer.class, principal));
    }
    @Test void savedPrototypeFullInputIsCapturedAndCallerCannotSilentlyOverrideIt() throws Exception {
        var tasks = new BoardTaskService(jdbc);
        var versions = new com.lh.eap.application.service.PrototypeVersionService(new com.lh.eap.persistence.mapper.JdbcPrototypeVersionStore(jdbc),
                new com.lh.eap.persistence.mapper.JdbcPrototypeDeliveryStore(jdbc));
        var version = versions.save(java.util.UUID.randomUUID(),"builder-alpha", "Prototype title", com.lh.eap.application.service.SemanticPrototypeFixture.body( "Prototype body"), List.of("Saved acceptance"));
        try {
            var task = tasks.create(new BoardTaskService.Draft(project, "Title", "", "ready", "Goal", "Criteria", UUID.randomUUID())); taskId = task.id();
            var selected = new TransactionTemplate(manager).execute(tx -> new com.lh.eap.application.service.BoardPrototypeService(jdbc, tasks, versions)
                    .select(taskId, new com.lh.eap.application.service.BoardPrototypeService.Selection(project, 1, version.id())));
            var ref = new com.lh.eap.api.TaskRef(project, taskId, selected.revision()); var changes = service(store());
            assertEquals("CODE_TASK_PROTOTYPE_MISMATCH", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> changes.prepareGeneration(principal, conversation, "Page.vue", "", "", ref)).getReason());
            var captured = changes.prepareGeneration(principal, conversation, "Page.vue", version.id().toString(), "", ref);
            assertEquals(versions.find(version.id()), captured.taskSnapshot().prototype());
            assertEquals(version.contentHash(), captured.prototypeContentHash());
            assertEquals(captured, new JdbcCodeGenerationStore(jdbc, manager).find(captured.id()).orElseThrow());
            var fixture = new AiChatApplicationTest(); fixture.root = root;
            var app = fixture.app(prompt -> {
                assertTrue(prompt.getUserMessage().getText().contains("Prototype body"));
                assertTrue(prompt.getUserMessage().getText().contains("Saved acceptance"));
                assertTrue(prompt.getUserMessage().getText().contains(version.contentHash()));
                return FakeChatModels.text("{\"files\":[{\"path\":\"Page.vue\",\"content\":\"candidate\"}]}");
            }, true, root, null);
            ReflectionTestUtils.setField(app, "codeChanges", changes);
            chatId = app.open("{}").conversationId();
            String request = JsonMapper.builder().build().writeValueAsString(Map.of("message", "edit", "toolMode", "none", "context",
                    Map.of("mode", "code", "targetPath", "Page.vue", "prototypeVersionId", version.id().toString(),
                            "taskRef", Map.of("projectId", project, "taskId", taskId.toString(), "revision", selected.revision()))));
            assertEquals(ref, app.send(chatId, request).proposal().generation().taskBinding());
        } finally {
            cleanupTask(); taskId = null;
            jdbc.update("DELETE FROM eap.prototype_version WHERE id=?", version.id());
        }
    }
    @AfterEach void cleanupTask() {
        if (jdbc != null && taskId != null) {
            if (chatId != null) {
                jdbc.update("DELETE FROM eap.code_proposal WHERE conversation_id=?", chatId);
                jdbc.update("DELETE FROM eap.code_generation WHERE conversation_id=?", chatId);
            }
            jdbc.update("DELETE FROM eap.code_proposal WHERE principal=?", principal);
            jdbc.update("DELETE FROM eap.code_generation WHERE principal=?", principal);
            jdbc.update("DELETE FROM eap.board_task WHERE id=? AND project_id=?", taskId, project);
        }
    }
}
