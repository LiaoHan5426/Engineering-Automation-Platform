package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.EapApplication;
import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.api.TaskRef;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.CodeChangeService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in real-model self-delivery; only the browser's explicit review may apply the candidate. */
class SelfPageDeliveryAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String SOURCE_PATH = "frontend/apps/web/src/components/SessionPanel.vue";
    private static final String SUFFIX_MARKER = "/** UI project group for this session";

    @Test
    @Timeout(value = 720, unit = TimeUnit.SECONDS)
    @EnabledIfEnvironmentVariable(named = "EAP_SELF_PAGE_DELIVERY", matches = "true")
    void deliversTheInitialDiffFocusFixThroughExplicitCandidateReview() throws Exception {
        var configuredRepo = Path.of(requiredEnvironment("EAP_SELF_PAGE_REPO"));
        assertTrue(configuredRepo.isAbsolute(), "EAP_SELF_PAGE_REPO must be an explicit absolute repository path");
        var workspace = configuredRepo.toRealPath();
        assertTrue(Files.isRegularFile(workspace.resolve("AGENTS.md")), "Repository AGENTS.md is required");
        var source = workspace.resolve(SOURCE_PATH).toRealPath();
        assertTrue(source.startsWith(workspace), "Source must remain inside the explicitly selected repository");
        assertTrue(Files.isRegularFile(source), "SessionPanel source is required");
        assertTrue(Files.size(source) > 0 && Files.size(source) <= 24_000, "Source exceeds the 24,000-byte bound");
        var capturedPath = System.getenv("EAP_SELF_PAGE_CAPTURED_RESULT");
        var replay = capturedPath != null && !capturedPath.isBlank();
        if (replay) {
            var original = Path.of(requiredEnvironment("EAP_SELF_PAGE_ORIGINAL_REPO")).toRealPath();
            assertNotEquals(original, workspace, "Captured replay requires a separate explicitly selected EAP workspace");
            assertTrue(Files.isRegularFile(Path.of(capturedPath)), "Explicit captured result must exist");
        }
        var target = Path.of("target").toAbsolutePath();
        Files.createDirectories(target);
        var session = Files.createTempDirectory(target, replay ? "self-page-replay-" : "self-page-").toRealPath();
        var connectionStore = replay ? session.resolve("unused-connections.json")
                : Path.of(requiredEnvironment("EAP_SELF_PAGE_CONNECTION_STORE")).toAbsolutePath().toRealPath();
        if (!replay) assertTrue(Files.isRegularFile(connectionStore) && Files.size(connectionStore) > 0,
                "An explicit nonempty real connection store is required");
        var beforeBytes = Files.readAllBytes(source);
        var before = Files.readString(source);
        var beforeHash = sha256(beforeBytes);
        // Evidence is durable even if setup, generation, review or validation fails.
        Files.write(session.resolve("source-before.vue"), beforeBytes);
        Files.writeString(session.resolve("source-before.sha256"), beforeHash + "\n");
        int focus = before.indexOf("() => workbench.diffFocusPath");
        assertTrue(focus >= 0, "Expected original diff focus watcher");
        int blockStart = before.lastIndexOf("watch(", focus);
        int blockEnd = before.indexOf(SUFFIX_MARKER, focus);
        assertTrue(blockStart >= 0 && blockEnd > blockStart, "Expected bounded original watcher block");
        var prefix = before.substring(0, blockStart);
        var suffix = before.substring(blockEnd);

        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema, "37");
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(
                    ToolUnknownReviewFixture.scopedDataSource(schema), workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext) app).registerBean(
                            SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.runtime.authorized-root=" + workspace,
                            "--eap.ai.connection-store=" + connectionStore,
                            "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5198")) {
                var backend = "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port");
                var setup = session.resolve("setup.json");
                Files.writeString(setup, JSON.writeValueAsString(Map.of(
                        "backend", backend, "workspace", workspace.toString(), "session", session.toString(),
                        "sourcePath", SOURCE_PATH, "sourceBeforeHash", beforeHash)));
                runBrowser("setup", setup, workspace);
                var inputs = JSON.readTree(Files.readString(session.resolve("inputs.json")));
                var project = inputs.path("project").asString("");
                var version = inputs.path("prototypeId").asString("");
                assertFalse(project.isBlank(), "Setup must save project");
                assertFalse(version.isBlank(), "Setup must save prototypeId");
                assertTrue(inputs.path("revision").asLong() > 0, "Setup must save task revision");
                var task = new TaskRef(project, UUID.fromString(inputs.path("taskId").asString()),
                        inputs.path("revision").asLong());
                assertArrayEquals(beforeBytes, Files.readAllBytes(source), "Setup changed the production source");

                var app = context.getBean(AiChatApplication.class);
                var conversation = replay ? UUID.randomUUID() : app.open("{}").conversationId();
                var generationContext = new LinkedHashMap<String, Object>();
                generationContext.put("mode", "code");
                generationContext.put("expert", "frontend");
                generationContext.put("approval", "review");
                generationContext.put("reasoning", "low");
                generationContext.put("targetPath", SOURCE_PATH);
                generationContext.put("componentPaths", List.of());
                generationContext.put("prototypeVersionId", version);
                generationContext.put("taskRef", Map.of("projectId", task.projectId(),
                        "taskId", task.taskId(), "revision", task.revision()));
                generationContext.put("instructions", "Fix only " + SOURCE_PATH + ". "
                        + "The first click on a non-first candidate diff file loses the requested path when SessionPanel mounts. "
                        + "Only replace the two watchers at lines 73-91 (the diffFocusPath watcher and mode watcher) "
                        + "with one watcher whose source is () => [props.mode, workbench.diffFocusPath], "
                        + "with { immediate: true, flush: 'post' }. In the callback, preserve diffFocusPath while mode "
                        + "is not changes. When mode is changes and path is nonempty, assign selectedPath.value = path "
                        + "then clear workbench.diffFocusPath. Keep the sessionKey reset watcher exactly unchanged. "
                        + "Preserve every byte before the first watch(diffFocusPath) block and from the comment "
                        + "'/** UI project group for this session' onward, including all template, imports, CSS and other logic. "
                        + "Do not introduce APIs or state. Return one complete file at the exact original path, no other files.");
                var request = Map.of("message", "修复候选 Diff 页面首次点击非首文件时挂载丢失路径，严格仅合并指定两个 watch。",
                        "toolMode", "none", "context", generationContext);
                var requestJson = JSON.writeValueAsString(request);
                CodeChangeService.Proposal proposal;
                if (replay) {
                    // An explicit new snapshot and task binding, never a fallback or repair of the old application.
                    var captured = JSON.readTree(Files.readString(Path.of(capturedPath))).path("proposal").path("files");
                    assertEquals(1, captured.size(), "Captured own-page result must contain exactly one file");
                    var file = captured.get(0);
                    assertEquals(SOURCE_PATH, file.path("path").asString());
                    assertEquals(before, file.path("before").asString(), "Replay must start from the captured original source");
                    var changes = context.getBean(CodeChangeService.class);
                    var snapshot = changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL, conversation,
                            SOURCE_PATH, version, "", task, List.of());
                    proposal = changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL, conversation, snapshot.id(),
                            JSON.writeValueAsString(Map.of("files", List.of(Map.of(
                                    "path", SOURCE_PATH, "content", file.path("content").asString())))), true);
                    Files.copy(Path.of(capturedPath), session.resolve("captured-model-result.json"));
                    Files.writeString(session.resolve("captured-replay-context.json"), requestJson);
                } else {
                    // Exactly one production send; no automatic replay/fake fallback or Java-side apply.
                    Files.writeString(session.resolve("real-model-request.json"), requestJson);
                    var result = app.send(conversation, requestJson);
                    Files.writeString(session.resolve("real-model-result.json"), JSON.writeValueAsString(result));
                    proposal = result.proposal();
                }
                assertArrayEquals(beforeBytes, Files.readAllBytes(source), "Generation changed the production source");
                assertEquals(beforeHash, sha256(Files.readAllBytes(source)), "Source baseline hash changed");
                assertNotNull(proposal, "Real model returned no candidate; inspect session evidence: " + session);
                assertFalse(proposal.applied(), "Candidate must remain unapplied before browser review");
                assertEquals(1, proposal.files().size(), "Only SessionPanel may be proposed");
                var change = proposal.files().getFirst();
                assertEquals(SOURCE_PATH, change.path());
                assertEquals(before, change.before(), "Candidate must use the original source baseline");
                var candidate = change.content();
                assertNotNull(candidate, "Candidate must contain complete source");
                assertTrue(candidate.length() >= prefix.length() + suffix.length()
                                && candidate.startsWith(prefix) && candidate.endsWith(suffix),
                        "Candidate changed outside the permitted watcher block; review real-model-result.json: " + session);
                assertNotEquals(before, candidate, "Candidate must change the watcher block");
                assertNotNull(proposal.generation(), "Candidate must retain a production generation snapshot");
                assertEquals(SOURCE_PATH, proposal.generation().targetPath());
                assertEquals(task, proposal.generation().taskBinding());
                assertEquals(version, proposal.generation().prototypeVersionId());

                var manifest = new LinkedHashMap<String, Object>();
                manifest.put("backend", backend);
                manifest.put("workspace", workspace.toString());
                manifest.put("task", task);
                manifest.put("proposal", proposal);
                manifest.put("sourceBeforeHash", beforeHash);
                manifest.put("provider", replay
                        ? "explicit captured real model output; separate EAP workspace, new snapshot and task binding"
                        : "real configured model");
                manifest.put("sourcePath", SOURCE_PATH);
                manifest.put("session", session.toString());
                var host = session.resolve("host.json");
                Files.writeString(host, JSON.writeValueAsString(manifest));
                runBrowser("deliver", host, workspace);
            }
        } finally {
            // Only this UUID-owned schema is cleaned. Never restore source over external edits.
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private static String requiredEnvironment(String name) {
        var value = System.getenv(name);
        assertNotNull(value, name + " must be explicitly configured");
        assertFalse(value.isBlank(), name + " must not be blank");
        return value;
    }

    private static String sha256(byte[] content) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
    }

    private static void runBrowser(String mode, Path input, Path workspace) throws Exception {
        var frontend = Path.of(System.getenv().getOrDefault("EAP_ACCEPTANCE_FRONTEND",
                workspace.resolve("frontend").toString())).toAbsolutePath().toRealPath();
        assertTrue(Files.isRegularFile(frontend.resolve("apps/web/__tests__/browser/self-page-delivery-live.mjs")),
                "Self-page delivery browser script is required");
        var command = new ProcessBuilder("vp", "node", "apps/web/__tests__/browser/self-page-delivery-live.mjs",
                mode, input.toString()).directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_"));
        var process = command.start();
        try {
            assertTrue(process.waitFor(300, TimeUnit.SECONDS), "Self-page browser phase timed out: " + mode);
            assertEquals(0, process.exitValue(), "Self-page browser phase failed: " + mode + "; evidence: " + input);
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
