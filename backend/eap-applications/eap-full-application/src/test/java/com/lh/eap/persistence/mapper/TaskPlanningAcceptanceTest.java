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
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@EnabledIfEnvironmentVariable(named = "EAP_TASK_PLANNING_CHROMIUM", matches = "true")
class TaskPlanningAcceptanceTest {
    @Test void plansOriginalTaskThenPreparesAndAppliesAnExplicitCandidate() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "task-planning-");
        var workspace = Files.createDirectory(session.resolve("workspace"));
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var planCalls = new AtomicInteger();
        var codeCalls = new AtomicInteger();
        Files.createDirectories(workspace.resolve("frontend"));
        Files.writeString(workspace.resolve("frontend/Page.vue"), "<template><h1>Existing page</h1></template>");
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var scoped = ToolUnknownReviewFixture.scopedDataSource(schema);
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(scoped, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class).initializers(app -> {
                var beans = (GenericApplicationContext) app;
                beans.registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides);
                beans.registerBean("directoryModel", ModelClientSource.class, () -> new ModelClientSource() {
                    public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                        return ChatClient.builder(FakeChatModels.scripted(prompt -> {
                            assertTrue(prompt.getUserMessage().getText().contains("Implement a reviewed page"));
                            assertTrue(prompt.getUserMessage().getText().contains("saved-task"));
                            if (prompt.getSystemMessage().getText().contains("Return ONLY a JSON object")) {
                                codeCalls.incrementAndGet();
                                assertTrue(prompt.getUserMessage().getText().contains("Reviewed implementation plan for task"));
                                assertTrue(prompt.getUserMessage().getText().contains("Existing page"));
                                return FakeChatModels.text("{\"summary\":\"Reviewed task implementation\",\"files\":[{\"path\":\"frontend/Page.vue\",\"content\":\"<template><h1>Implemented task</h1></template>\"}]}");
                            }
                            planCalls.incrementAndGet();
                            return FakeChatModels.text("Review the task, preserve the existing page, then implement the heading and verify it.");
                        })).build();
                    }
                    public ChatClient completion(ModelConnectionSnapshot snapshot) {
                        throw new AssertionError("Task code and planning use the production conversational path");
                    }
                }, definition -> definition.setPrimary(true));
            }).run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                    "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                    "--eap.web.allowed-origins=http://127.0.0.1:5201",
                    "--eap.ai.connection-store=" + session.resolve("connections.json"),
                    "--eap.ai.artifact-root=" + session.resolve("artifacts"))) {
                var models = context.getBean(ModelConnections.class);
                var model = models.create("Directory fixture", "https://127.0.0.1:9/v1", "fixture-key", true, true);
                models.configureModels(model.id(), List.of(new ModelOption("directory-fixture", List.of())), List.of("directory-fixture"), "directory-fixture");
                var task = context.getBean(com.lh.eap.application.service.BoardTaskService.class).create(
                        new com.lh.eap.application.service.BoardTaskService.Draft("task-planning-qa", "Plan and implement task", "", "planned",
                                "Implement a reviewed page", "Heading is Implemented task", UUID.randomUUID()));
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JsonMapper.builder().build().writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"), "taskId", task.id())));
                var process = new ProcessBuilder("vp", "node", "apps/web/__tests__/browser/task-planning-live.mjs", manifest.toString())
                        .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile()).inheritIO().start();
                try { assertTrue(process.waitFor(120, TimeUnit.SECONDS)); assertEquals(0, process.exitValue(), "Browser evidence: " + session); }
                finally { if (process.isAlive()) { process.descendants().forEach(ProcessHandle::destroyForcibly); process.destroyForcibly(); } }
                var jdbc = new JdbcTemplate(scoped);
                var current = context.getBean(com.lh.eap.application.service.BoardTaskService.class).get(task.id(), "task-planning-qa");
                assertEquals("ready", current.column());
                assertEquals(3, current.revision());
                assertEquals("Reviewed implementation plan for task", current.notes());
                assertEquals(1, planCalls.get()); assertEquals(1, codeCalls.get());
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.code_generation", Integer.class));
                assertEquals("APPLIED", jdbc.queryForObject("SELECT status FROM eap.code_proposal", String.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution", Integer.class));
                assertEquals("<template><h1>Implemented task</h1></template>", Files.readString(workspace.resolve("frontend/Page.vue")));
                Files.writeString(session.resolve("validation.json"), "{\"originalTaskPlanned\":true,\"readyExplicit\":true,\"taskRevision\":3,\"planCalls\":1,\"codeCalls\":1,\"proposalApplied\":true,\"model\":\"explicit Fake ChatModel\",\"toolExecutions\":0}");
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
