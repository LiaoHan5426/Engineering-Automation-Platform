package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.EapApplication;
import com.lh.eap.ai.AiConversationRegistry;
import com.lh.eap.ai.ChatClients;
import com.lh.eap.ai.ModelClientSource;
import com.lh.eap.ai.ModelConnections;
import com.lh.eap.ai.ModelConnectionSnapshot;
import com.lh.eap.ai.ModelOption;
import com.lh.eap.ai.FakeChatModels;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@EnabledIfEnvironmentVariable(named="EAP_MODEL_HISTORY_CHROMIUM", matches="true")
class ModelHistoryAcceptanceTest {
    @Test void clearsActualSdkHistoryFromChatWithoutLosingTheDraftOrTaskMemory() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "model-history-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var summaryCalls = new java.util.concurrent.atomic.AtomicInteger();
        try {
            CurrentContractTestSchema.migrate(session, schema, "37");
            var override = new SourceWriteReviewPersistenceTest.Overrides(ToolUnknownReviewFixture.scopedDataSource(schema), workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> {
                        var beans = (GenericApplicationContext)app;
                        beans.registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> override);
                        beans.registerBean("summaryClients", ModelClientSource.class, () -> new ModelClientSource() {
                            public org.springframework.ai.chat.client.ChatClient conversational(ModelConnectionSnapshot snapshot) {
                                return org.springframework.ai.chat.client.ChatClient.builder(FakeChatModels.scripted(prompt -> { throw new AssertionError("Unexpected conversational call"); })).build();
                            }
                            public org.springframework.ai.chat.client.ChatClient completion(ModelConnectionSnapshot snapshot) {
                                return org.springframework.ai.chat.client.ChatClient.builder(FakeChatModels.scripted(prompt -> {
                                    summaryCalls.incrementAndGet();
                                    assertTrue(prompt.toString().contains("Private old context"));
                                    return FakeChatModels.text("Fixture summary: review the remaining delivery work.");
                                })).build();
                            }
                        }, definition -> definition.setPrimary(true));
                    })
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.ai.connection-store="+session.resolve("connections.json"),
                            "--eap.ai.artifact-root="+session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5195")) {
                var registry = context.getBean(AiConversationRegistry.class);
                var conversation = registry.open(workspace, "history-qa");
                var models = context.getBean(ModelConnections.class);
                var saved = models.create("Summary fixture", "https://127.0.0.1:9/v1", "fixture-key", true, true);
                models.configureModels(saved.id(), List.of(new ModelOption("summary-fixture", List.of())), List.of("summary-fixture"), "summary-fixture");
                var selected = models.requireModel(saved.id(), "summary-fixture");
                registry.bind(conversation.id, new AiConversationRegistry.Binding(selected.id, selected.revision, selected.name, selected.model, selected.baseUrl, selected.configurationRevision, models.chatClient(selected)), false);
                registry.putWorkingMemory(conversation.id, "Keep task goal", List.of("Keep constraint"), List.of(), List.of(), Set.of());
                var before = registry.workingMemory(conversation.id);
                context.getBean(ChatMemory.class).add(ChatClients.memoryKey(AiConversationRegistry.PRINCIPAL, conversation.id), new UserMessage("Private old context"));
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JsonMapper.builder().build().writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port"),
                        "conversationId", conversation.id, "workspaceLabel", "history-qa")));
                var command = new ProcessBuilder("node", "apps/web/__tests__/browser/model-history-live.mjs", manifest.toString())
                        .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile()).inheritIO();
                command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_"));
                var process = command.start();
                try {
                    assertTrue(process.waitFor(120, TimeUnit.SECONDS), "Browser timed out: "+session);
                    assertEquals(0, process.exitValue(), "Browser failed: "+session);
                } finally {
                    if (process.isAlive()) { process.descendants().forEach(ProcessHandle::destroyForcibly); process.destroyForcibly(); }
                }
                assertEquals(0, registry.modelHistory(conversation.id).messages());
                var after = registry.workingMemory(conversation.id);
                assertEquals("Updated delivery goal", after.goal());
                assertEquals(List.of("Use shared components", "Keep source evidence"), after.constraints());
                assertEquals(before.facts(), after.facts());
                assertEquals(before.evidenceRefs(), after.evidenceRefs());
                assertEquals(1, summaryCalls.get());
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }
}
