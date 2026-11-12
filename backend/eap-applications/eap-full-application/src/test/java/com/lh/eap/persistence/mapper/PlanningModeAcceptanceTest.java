package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.EapApplication;
import com.lh.eap.ai.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@EnabledIfEnvironmentVariable(named = "EAP_PLANNING_CHROMIUM", matches = "true")
class PlanningModeAcceptanceTest {
    @Test void plansFromAuthorizedSourceWithoutToolsOrGenerationAndRestoresTheMode() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "planning-mode-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        Files.createDirectories(workspace.resolve("frontend"));
        var source = "<template><h1>Existing review page</h1></template>";
        Files.writeString(workspace.resolve("frontend/Page.vue"), source);
        Files.writeString(workspace.resolve("frontend/Host.ts"), "export const hostRoute = '#/detail'");
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var calls = new AtomicInteger();
        try {
            CurrentContractTestSchema.migrate(session, schema, "37");
            var scoped = ToolUnknownReviewFixture.scopedDataSource(schema);
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(scoped, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> {
                        var beans = (GenericApplicationContext) app;
                        beans.registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides);
                        beans.registerBean("planningClients", ModelClientSource.class, () -> new ModelClientSource() {
                            public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                                return ChatClient.builder(FakeChatModels.scripted(prompt -> {
                                    int call = calls.incrementAndGet();
                                    if (call >= 3) assertTrue(prompt.getUserMessage().getText().contains("Reviewed task implementation plan"));
                                    if (call == 3) assertTrue(prompt.getUserMessage().getText().contains("export const hostRoute = '#/detail'"));
                                    assertTrue(prompt.toString().contains("No tools are available"));
                                    assertTrue(prompt.toString().contains("Existing review page"));
                                    if (prompt.getOptions() instanceof ToolCallingChatOptions options)
                                        assertTrue(options.getToolCallbacks() == null || options.getToolCallbacks().isEmpty());
                                    return FakeChatModels.text("Read-only plan: preserve the existing page, update the shared controls, then verify the result. No files changed.");
                                })).build();
                            }
                            public ChatClient completion(ModelConnectionSnapshot snapshot) {
                                throw new AssertionError("Planning uses the existing conversational path");
                            }
                        }, definition -> definition.setPrimary(true));
                    })
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.runtime.authorized-root=" + workspace,
                            "--eap.ai.connection-store=" + session.resolve("connections.json"),
                            "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5196")) {
                var models = context.getBean(ModelConnections.class);
                var saved = models.create("Planning fixture", "https://127.0.0.1:9/v1", "fixture-key", true, true);
                models.configureModels(saved.id(), List.of(new ModelOption("planning-fixture", List.of())), List.of("planning-fixture"), "planning-fixture");
                var conversation = context.getBean(AiChatApplication.class).open("{}");
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JsonMapper.builder().build().writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"),
                        "conversationId", conversation.conversationId(), "workspaceLabel", conversation.workspaceLabel())));
                var process = new ProcessBuilder("vp", "node", "apps/web/__tests__/browser/planning-mode-live.mjs", manifest.toString())
                        .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile())
                        .inheritIO();
                process.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_"));
                var browser = process.start();
                try {
                    assertTrue(browser.waitFor(120, TimeUnit.SECONDS), "Planning browser timed out: " + session);
                    assertEquals(0, browser.exitValue(), "Planning browser failed: " + session);
                } finally {
                    if (browser.isAlive()) { browser.descendants().forEach(ProcessHandle::destroyForcibly); browser.destroyForcibly(); }
                }
                assertEquals(3, calls.get());
                assertEquals(source, Files.readString(workspace.resolve("frontend/Page.vue")));
                var jdbc = new JdbcTemplate(scoped);
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.code_generation", Integer.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.code_proposal", Integer.class));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task WHERE project_id='planning-task-qa'", Integer.class));
                assertEquals(conversation.conversationId().toString(), jdbc.queryForObject("SELECT session_id FROM eap.board_task WHERE project_id='planning-task-qa'", String.class));
                assertEquals("ready", jdbc.queryForObject("SELECT column_id FROM eap.board_task WHERE project_id='planning-task-qa'", String.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution", Integer.class));
                var taskId = jdbc.queryForObject("SELECT id FROM eap.board_task WHERE project_id='planning-task-qa'", UUID.class);
                var revision = jdbc.queryForObject("SELECT revision FROM eap.board_task WHERE id=?", Long.class, taskId);
                var changes = context.getBean(com.lh.eap.delivery.CodeChangeService.class);
                var ref = new com.lh.eap.api.TaskRef("planning-task-qa", taskId, revision);
                assertEquals(taskId, changes.planningTask(ref).taskId());
                assertEquals("Reviewed task implementation plan", changes.planningTask(ref).notes());
                var captured = changes.prepareGeneration(AiConversationRegistry.PRINCIPAL,
                        conversation.conversationId(), "frontend/Page.vue", "", "", ref);
                assertEquals("Reviewed task implementation plan", captured.taskSnapshot().notes());
                var reopened = context.getBean(com.lh.eap.delivery.JdbcCodeGenerationStore.class)
                        .find(captured.id()).orElseThrow();
                assertEquals(captured.taskSnapshot(), reopened.taskSnapshot());
                context.getBean(AiChatApplication.class).send(conversation.conversationId(),
                        JsonMapper.builder().build().writeValueAsString(Map.of(
                                "message", "Review the saved task plan", "toolMode", "none",
                                "context", Map.of("mode", "plan", "targetPath", "frontend/Page.vue", "taskRef", ref))));
                assertEquals(4, calls.get());
                assertEquals("BOARD_REVISION_CONFLICT", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                        () -> changes.planningTask(new com.lh.eap.api.TaskRef(ref.projectId(), taskId, revision - 1))).getReason());
                assertThrows(org.springframework.web.server.ResponseStatusException.class,
                        () -> changes.planningTask(new com.lh.eap.api.TaskRef("other-project", taskId, revision)));
                jdbc.update("UPDATE eap.board_task SET column_id='done' WHERE id=?", taskId);
                assertEquals("BOARD_PREPARATION_REQUIRED", assertThrows(org.springframework.web.server.ResponseStatusException.class,
                        () -> changes.planningTask(ref)).getReason());

            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
