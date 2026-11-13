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

@EnabledIfEnvironmentVariable(named = "EAP_ENGINEERING_AGENT_CHROMIUM", matches = "true")
class EngineeringAgentAcceptanceTest {
    @Test void readsFrozenScopeThroughToolsThenAppliesOnlyAfterConfirmation() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "engineering-agent-");
        boolean realModel = "true".equals(System.getenv("EAP_ENGINEERING_AGENT_REAL_MODEL"));
        String connectionStore = System.getenv("EAP_ENGINEERING_AGENT_CONNECTION_STORE");
        if (realModel) {
            assertNotNull(connectionStore, "Real model validation requires an explicit connection store");
            try (var input = Files.newInputStream(Path.of(connectionStore))) { assertTrue(input.read() >= 0); }
        }
        var workspace = Files.createDirectory(session.resolve("workspace"));
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var readCalls = new AtomicInteger();
        var codeCalls = new AtomicInteger();
        Files.createDirectories(workspace.resolve("frontend"));
        Files.writeString(workspace.resolve("frontend/Page.vue"), "<template><h1>Existing page</h1></template>");
        Files.writeString(workspace.resolve("frontend/page.css"), "h1 {color: teal}");
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var scoped = ToolUnknownReviewFixture.scopedDataSource(schema);
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(scoped, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class).initializers(app -> {
                var beans = (GenericApplicationContext) app;
                beans.registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides);
                if (realModel) return;
                beans.registerBean("directoryModel", ModelClientSource.class, () -> new ModelClientSource() {
                    public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                        return ChatClients.createClient(ChatClient.builder(FakeChatModels.scripted(prompt -> {
                            codeCalls.incrementAndGet();
                            var responses = prompt.getInstructions().stream().filter(org.springframework.ai.chat.messages.ToolResponseMessage.class::isInstance)
                                    .map(org.springframework.ai.chat.messages.ToolResponseMessage.class::cast).toList();
                            if (responses.isEmpty()) {
                                assertFalse(prompt.getUserMessage().getText().contains("Existing page"));
                                readCalls.incrementAndGet();
                                return new org.springframework.ai.chat.model.ChatResponse(List.of(new org.springframework.ai.chat.model.Generation(
                                    org.springframework.ai.chat.messages.AssistantMessage.builder().content("").toolCalls(List.of(
                                        new org.springframework.ai.chat.messages.AssistantMessage.ToolCall("source-1", "function", "read_selected_sources",
                                            "{\"paths\":[\"frontend/Page.vue\",\"frontend/page.css\"]}"))).build())));
                            }
                            assertTrue(responses.toString().contains("Existing page"));
                            assertTrue(responses.toString().contains("color: teal"));
                            return FakeChatModels.text("{\"summary\":\"Reviewed task implementation\",\"files\":[{\"path\":\"frontend/Page.vue\",\"content\":\"<script setup>import './page.css'</script><template><h1>Implemented task</h1></template>\"},{\"path\":\"frontend/page.css\",\"content\":\"h1 {color: navy}\"}]}");
                        })), org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().build());
                    }

                    public ChatClient completion(ModelConnectionSnapshot snapshot) {
                        throw new AssertionError("Task code and planning use the production conversational path");
                    }
                }, definition -> definition.setPrimary(true));
            }).run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                    "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                    "--eap.web.allowed-origins=http://127.0.0.1:5202",
                    "--eap.ai.connection-store=" + (realModel ? Path.of(connectionStore).toAbsolutePath() : session.resolve("connections.json")),
                    "--eap.ai.artifact-root=" + session.resolve("artifacts"))) {
                var models = context.getBean(ModelConnections.class);
                if (!realModel) {
                    var model = models.create("Engineering fixture", "https://127.0.0.1:9/v1", "fixture-key", true, true);
                    models.configureModels(model.id(), List.of(new ModelOption("engineering-fixture", List.of())), List.of("engineering-fixture"), "engineering-fixture");
                }
                var selected = models.list().items().stream().filter(item -> item.id().equals(models.list().effectiveDefaultId())).findFirst().orElseThrow();
                assertNotEquals("chatgpt-plan", selected.kind());
                var task = context.getBean(com.lh.eap.application.service.BoardTaskService.class).create(
                        new com.lh.eap.application.service.BoardTaskService.Draft("engineering-agent-qa", "Plan and implement task", "", "ready",
                                "Implement a reviewed page: heading Implemented task, import ./page.css, set h1 color to navy. Include both selected files in the proposal.",
                                "Heading is Implemented task and h1 uses navy", UUID.randomUUID()));
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JsonMapper.builder().build().writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"), "taskId", task.id(),
                        "modelLabel", selected.name() + " · " + selected.defaultModel())));
                var process = new ProcessBuilder("vp", "node", "apps/web/__tests__/browser/engineering-agent-live.mjs", manifest.toString())
                        .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile()).inheritIO().start();
                try { assertTrue(process.waitFor(180, TimeUnit.SECONDS)); assertEquals(0, process.exitValue(), "Browser evidence: " + session); }
                finally { if (process.isAlive()) { process.descendants().forEach(ProcessHandle::destroyForcibly); process.destroyForcibly(); } }
                var jdbc = new JdbcTemplate(scoped);
                var current = context.getBean(com.lh.eap.application.service.BoardTaskService.class).get(task.id(), "engineering-agent-qa");
                assertEquals("ready", current.column());
                assertEquals(1, current.revision());
                if (!realModel) { assertEquals(1, readCalls.get()); assertEquals(2, codeCalls.get()); }
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.code_generation", Integer.class));
                assertEquals("APPLIED", jdbc.queryForObject("SELECT status FROM eap.code_proposal", String.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution", Integer.class));
                assertTrue(Files.readString(workspace.resolve("frontend/Page.vue")).contains("Implemented task"));
                assertTrue(Files.readString(workspace.resolve("frontend/page.css")).matches("(?s).*h1\\s*\\{[^}]*color\\s*:\\s*navy\\s*;?\\s*}.*"));
                Files.writeString(session.resolve("validation.json"), JsonMapper.builder().build().writeValueAsString(Map.of(
                        "taskRevision", 1, "proposalApplied", true, "model", realModel ? "real configured provider" : "explicit Fake ChatModel",
                        "fakeReadCalls", readCalls.get(), "fakeModelCalls", codeCalls.get(), "shellExecutions", 0)));
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
