package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.FileExecutionArtifactStore;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

class EngineeringTaskFlowTest {
    @TempDir Path root;
    private static final String CODE = "{\"summary\":\"Vue component\",\"files\":[{\"path\":\"src/components/Checkout.vue\",\"content\":\"<template><button>Checkout</button></template>\"}]}";
    private static final String COMPOSER = "{\"summary\":\"Edit composer\",\"files\":[{\"path\":\"src/features/chat/TaskComposer.vue\",\"content\":\"<script setup>updated</script>\"}]}";

    @Test void selectedExpertAndFilesReachModelAndExplicitReviewWritesSource() throws Exception {
        var observed = new AtomicReference<org.springframework.ai.chat.prompt.Prompt>();
        var handlers = new CapabilityHandlerRegistry(List.of());
        var memory = MessageWindowChatMemory.builder().maxMessages(20).build();
        var client = EngineeringAiConfiguration.createClient(ChatClient.builder(FakeChatModels.scripted(prompt -> {
            observed.set(prompt);
            return FakeChatModels.text(COMPOSER);
        })), memory);
        var service = new EngineeringChatService(client, handlers, (Path) null, new FileExecutionArtifactStore(root.resolve("artifacts")));
        var status = new AiConnectionStatus(handlers, root, null, "openai", "offline", "https://api.openai.com", true);
        var app = new AiChatApplication(status, new AiConversationRegistry(memory), service, root);
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        ReflectionTestUtils.setField(app, "codeChanges", changes);
        var versions = org.mockito.Mockito.mock(com.lh.eap.application.service.PrototypeVersionService.class);
        var versionId = UUID.fromString("116967fb-fcc8-49ec-a8a4-2042ae80ecb0");
        org.mockito.Mockito.when(versions.find(versionId)).thenReturn(new com.lh.eap.application.service.PrototypeVersion(
                versionId, "builder-alpha", "Saved checkout", "A saved design", 1, "button increments", List.of("Accessible button"), "hash", java.time.Instant.now()));
        ReflectionTestUtils.setField(app, "prototypes", versions);
        var id = app.open("{}").conversationId();
        Files.createDirectories(root.resolve("src/features/chat"));
        Files.writeString(root.resolve("src/features/chat/TaskComposer.vue"), "<script setup>existing</script>");
        var response = app.send(id, """
            {"message":"Implement checkout","toolMode":"none","context":{
              "mode":"code","expert":"frontend","instructions":"Use accessible labels",
              "prototypeVersionId":"116967fb-fcc8-49ec-a8a4-2042ae80ecb0",
              "targetPath":"src/features/chat/TaskComposer.vue",
              "files":[{"name":"design.md","content":"A checkout button"}]}}
            """);
        assertTrue(observed.get().getSystemMessage().getText().contains("Vue 3"));
        assertTrue(observed.get().getSystemMessage().getText().contains("accessible labels"));
        assertTrue(observed.get().getSystemMessage().getText().contains("<workspace-source>"));
        assertTrue(observed.get().getSystemMessage().getText().contains("src/features/chat/TaskComposer.vue"));
        assertTrue(observed.get().getUserMessage().getText().contains("A checkout button"));
        assertTrue(observed.get().getUserMessage().getText().contains("Saved checkout"));
        assertTrue(observed.get().getUserMessage().getText().contains("Accessible button"));
        assertTrue(observed.get().getUserMessage().getText().contains("<workspace-source path=\"src/features/chat/TaskComposer.vue\""));
        assertTrue(observed.get().getUserMessage().getText().contains("<script setup>existing</script>"));
        assertNotNull(response.proposal());
        assertEquals("src/features/chat/TaskComposer.vue", response.proposal().files().getFirst().path());
        assertThrows(ResponseStatusException.class, () -> app.apply(id, response.proposal().id(), "{\"confirmed\":false}"));
        var result = app.apply(id, response.proposal().id(), "{\"confirmed\":true}");
        assertEquals(List.of("src/features/chat/TaskComposer.vue"), result.written());
        assertEquals("not_requested", result.verification());
        assertTrue(result.checks().isEmpty());
        assertEquals("<script setup>updated</script>", Files.readString(root.resolve(result.written().getFirst())));
    }

    @Test void applyRunsConfiguredVerificationAndKeepsExitCodes() throws Exception {
        Files.createDirectories(root.resolve("src/components"));
        var runner = new CodeVerificationService.Runner() {
            @Override public CodeVerificationService.ProcessResult run(Path workspace, List<String> command, int timeoutSeconds) {
                return new CodeVerificationService.ProcessResult(7, "typecheck failed");
            }
        };
        var verify = new CodeVerificationService(true, 5, List.of(new CodeVerificationService.Spec("typecheck", List.of("stub"))), runner);
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""), verify);
        var id = UUID.randomUUID();
        var proposal = changes.propose(id, CODE);
        var applied = changes.apply(id, proposal.id(), true);
        assertEquals("requested", applied.verification());
        assertEquals(1, applied.checks().size());
        assertEquals("typecheck", applied.checks().getFirst().name());
        assertEquals(7, applied.checks().getFirst().exitCode());
        assertEquals("typecheck failed", applied.checks().getFirst().summary());
        assertFalse(applied.verification().equals("passed"));
    }

    @Test void readOnlyAndMissingRootCannotBeBypassedByApplyRequest() {
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        var id = UUID.randomUUID();
        var readOnly = changes.propose(id, CODE, false);
        assertEquals("READ_ONLY_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> changes.apply(id, readOnly.id(), true)).getReason());
        var noRoot = new CodeChangeService(new RuntimeWorkspace(root, "", ""));
        var proposal = noRoot.propose(id, CODE);
        assertEquals("WORKSPACE_WRITE_NOT_AUTHORIZED", assertThrows(ResponseStatusException.class,
                () -> noRoot.apply(id, proposal.id(), true)).getReason());
    }

    @Test void userEditsAndCrossConversationRequestsArePreserved() throws Exception {
        Files.createDirectories(root.resolve("src/components"));
        Path target = root.resolve("src/components/Checkout.vue");
        Files.writeString(target, "before");
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        var id = UUID.randomUUID();
        var proposal = changes.propose(id, CODE);
        Files.writeString(target, "user edit");
        assertThrows(ResponseStatusException.class, () -> changes.apply(UUID.randomUUID(), proposal.id(), true));
        assertEquals("FILE_CHANGED_SINCE_PROPOSAL", assertThrows(ResponseStatusException.class,
                () -> changes.apply(id, proposal.id(), true)).getReason());
        assertEquals("user edit", Files.readString(target));
    }

    @Test void unsafePathsAndOversizedContextAreRejected() {
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        for (String path : List.of("../outside.ts", ".git/config", "C:/outside.ts", "src/../../file.ts", "package.json")) {
            assertThrows(ResponseStatusException.class, () -> changes.propose(UUID.randomUUID(), CODE.replace("src/components/Checkout.vue", path)));
        }
        assertThrows(ResponseStatusException.class, () -> TaskContext.parse(Map.of("files", List.of(Map.of("name", "large", "content", "x".repeat(16001))))));
        assertThrows(ResponseStatusException.class, () -> TaskContext.parse(Map.of("workspace", root.toString())));
    }

    @Test void baselineInspectionRequiresAuthorizedRootAndHashesExistingSource() throws Exception {
        Files.createDirectories(root.resolve("src/components"));
        Path target = root.resolve("src/components/Checkout.vue");
        Files.writeString(target, "baseline-body");
        var denied = new CodeChangeService(new RuntimeWorkspace(root, "", "")).inspectBaseline("src/components/Checkout.vue");
        assertEquals("AUTHORIZED_ROOT_MISSING", denied.denial());
        assertEquals("", denied.baseHash());
        var allowed = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        var missing = allowed.inspectBaseline("src/components/Missing.vue");
        assertFalse(missing.exists());
        assertEquals("absent", missing.baseHash());
        assertEquals("", missing.denial());
        var present = allowed.inspectBaseline("src/components/Checkout.vue");
        assertTrue(present.exists());
        assertEquals("", present.denial());
        assertFalse(present.baseHash().isBlank());
        assertNotEquals("absent", present.baseHash());
        assertEquals("INVALID_CODE_PATH", allowed.inspectBaseline("../outside.ts").denial());
    }

    @Test void dirtyInspectionRequiresAuthorizedRootAndParsesPorcelain() {
        var denied = new CodeChangeService(new RuntimeWorkspace(root, "", "")).inspectDirty();
        assertFalse(denied.requested());
        assertEquals("AUTHORIZED_ROOT_MISSING", denied.denial());
        assertTrue(denied.paths().isEmpty());
        var runner = (CodeChangeService.DirtyRunner) workspace -> " M src/features/chat/TaskComposer.vue\n?? docs/note.md\n";
        var dirty = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""), null, runner).inspectDirty();
        assertTrue(dirty.requested());
        assertEquals("", dirty.denial());
        assertEquals(2, dirty.count());
        assertEquals(List.of("src/features/chat/TaskComposer.vue", "docs/note.md"), dirty.paths());
        assertEquals("dirty", dirty.detail());
        var clean = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""), null, workspace -> "").inspectDirty();
        assertTrue(clean.requested());
        assertEquals(0, clean.count());
        assertEquals("clean", clean.detail());
        assertEquals("src/App.vue", CodeChangeService.dirtyPath("R  old/App.vue -> src/App.vue"));
    }

    @Test void sourceInspectionReadsWorkspaceWithoutGrantingWriteRoot() throws Exception {
        Files.createDirectories(root.resolve("src/features/chat"));
        Path target = root.resolve("src/features/chat/TaskComposer.vue");
        Files.writeString(target, "<script setup>const x = 1</script>\n".repeat(200));
        var withoutRoot = new CodeChangeService(new RuntimeWorkspace(root, "", ""));
        var excerpt = withoutRoot.inspectSource("src/features/chat/TaskComposer.vue");
        assertTrue(excerpt.exists());
        assertEquals("", excerpt.denial());
        assertTrue(excerpt.bytes() > excerpt.excerpt().length());
        assertTrue(excerpt.excerpt().startsWith("<script setup>"));
        assertFalse(excerpt.baseHash().isBlank());
        assertEquals("AUTHORIZED_ROOT_MISSING", withoutRoot.inspectBaseline("src/features/chat/TaskComposer.vue").denial());
        assertEquals("INVALID_CODE_PATH", withoutRoot.inspectSource("../outside.ts").denial());
        assertEquals("absent", withoutRoot.inspectSource("src/features/chat/Missing.vue").baseHash());
        var bound = TaskContext.withWorkspaceSource("revise the composer", excerpt);
        assertTrue(bound.contains("<workspace-source path=\"src/features/chat/TaskComposer.vue\""));
        assertTrue(bound.contains("<script setup>"));
        assertTrue(bound.contains("</workspace-source>"));
        var ctx = TaskContext.parse(Map.of(
                "mode", "code",
                "expert", "frontend",
                "targetPath", "frontend/apps/web/src/features/chat/TaskComposer.vue"));
        assertEquals("frontend/apps/web/src/features/chat/TaskComposer.vue", ctx.targetPath());
        assertTrue(ctx.systemInstructions().contains("<workspace-source>"));
        assertTrue(ctx.systemInstructions().contains("frontend/apps/web/src/features/chat/TaskComposer.vue"));
        assertTrue(ctx.systemInstructions().contains("MUST include that exact path"));
        assertThrows(ResponseStatusException.class, () -> TaskContext.parse(Map.of("targetPath", "../secret")));

        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""));
        String shellOnly = """
                {"summary":"new shell","files":[{"path":"src/components/NewShell.vue","content":"<template>new</template>"}]}
                """;
        var missingTarget = assertThrows(ResponseStatusException.class,
                () -> changes.propose(UUID.randomUUID(), shellOnly, true, "src/features/chat/TaskComposer.vue"));
        assertEquals("TARGET_PATH_REQUIRED", missingTarget.getReason());
        String withTarget = """
                {"summary":"edit composer","files":[{"path":"src/features/chat/TaskComposer.vue","content":"<script setup>const x = 2</script>"}]}
                """;
        var proposal = changes.propose(UUID.randomUUID(), withTarget, true, "src/features/chat/TaskComposer.vue");
        assertEquals(1, proposal.files().size());
        assertEquals("src/features/chat/TaskComposer.vue", proposal.files().getFirst().path());
    }

    @Test void processDirtyAndVerificationRunnersDrainStdout() throws Exception {
        assumeTrue(isCommandAvailable("git"), "git required for process runner checks");
        Files.writeString(root.resolve("README.md"), "dirty-runner\n");
        runGit(root, "init");
        runGit(root, "config", "user.email", "test@example.com");
        runGit(root, "config", "user.name", "test");
        runGit(root, "add", "README.md");
        runGit(root, "commit", "-m", "init");
        Files.writeString(root.resolve("README.md"), "changed\n");
        var settings = org.mockito.Mockito.mock(com.lh.eap.application.service.CapabilitySettings.class);
        org.mockito.Mockito.when(settings.enabled("git-status")).thenReturn(true);
        var registry = new com.lh.eap.core.CapabilityRegistry().register(new com.lh.eap.capability.GitCapability("status"));
        try (var executor = new com.lh.eap.core.DefaultProcessExecutor()) {
            var runner = new CapabilityDirtyRunner(settings, registry, executor);
            assertTrue(runner.porcelain(root).contains("README.md"));
            var dirty = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""), null, runner).inspectDirty();
            assertTrue(dirty.requested(), dirty.detail());
            assertEquals("", dirty.denial());
            assertTrue(dirty.count() >= 1);
        }
        var version = CodeVerificationService.ProcessRunner.INSTANCE.run(root, List.of("git", "--version"), 10);
        assertEquals(0, version.exitCode());
        assertTrue(version.output().toLowerCase().contains("git"));
    }

    @Test void verificationProbeRunsWithoutEnablingConfiguredChecks() throws Exception {
        assumeTrue(isCommandAvailable("git"), "git required for process runner checks");
        // enabled=false and empty specs: probe must still run; apply path must stay not_requested.
        var verify = new CodeVerificationService(false, 10, List.of(), CodeVerificationService.ProcessRunner.INSTANCE);
        var changes = new CodeChangeService(new RuntimeWorkspace(root, root.toString(), ""), verify);
        var probe = changes.probeVerification();
        assertTrue(probe.requested());
        assertEquals("", probe.denial());
        assertEquals(CodeVerificationService.PROBE_NAME, probe.name());
        assertEquals(0, probe.exitCode());
        assertTrue(probe.summary().toLowerCase().contains("git"));
        assertFalse(verify.enabled());
        var missing = new CodeChangeService(new RuntimeWorkspace(root, "", ""), verify).probeVerification();
        assertFalse(missing.requested());
        assertEquals("AUTHORIZED_ROOT_MISSING", missing.denial());
    }

    private static boolean isCommandAvailable(String command) {
        try {
            var process = new ProcessBuilder(command, "--version").redirectErrorStream(true).start();
            return process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS) && process.exitValue() == 0;
        } catch (Exception failure) {
            return false;
        }
    }

    private static void runGit(Path workspace, String... args) throws Exception {
        var command = new ArrayList<String>();
        command.add("git");
        command.addAll(List.of(args));
        var process = new ProcessBuilder(command).directory(workspace.toFile()).redirectErrorStream(true).start();
        assertTrue(process.waitFor(20, java.util.concurrent.TimeUnit.SECONDS));
        assertEquals(0, process.exitValue(), new String(process.getInputStream().readAllBytes()));
    }
}
