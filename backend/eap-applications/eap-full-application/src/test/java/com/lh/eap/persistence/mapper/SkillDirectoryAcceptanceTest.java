package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.EapApplication;
import com.lh.eap.ai.*;
import com.lh.eap.skill.SkillService;
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

@EnabledIfEnvironmentVariable(named = "EAP_SKILL_DIRECTORY_CHROMIUM", matches = "true")
class SkillDirectoryAcceptanceTest {
    @Test void importsDirectoryAsImmutableTextAndUsesTheExactEnabledVersion() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "skill-directory-");
        var workspace = Files.createDirectory(session.resolve("workspace"));
        var directory = Files.createDirectories(session.resolve("review-guide/references"));
        var raw = "---\nname: directory-review\ndescription: Review routing\n---\nReview the routing contract using references/checks.md.\n";
        Files.writeString(directory.getParent().resolve("SKILL.md"), raw);
        Files.writeString(directory.resolve("checks.md"), "Keep host hash navigation. Review references explicitly.");
        var invalid = Files.createDirectory(session.resolve("invalid-guide"));
        Files.writeString(invalid.resolve("SKILL.md"), raw);
        Files.writeString(invalid.resolve("run.js"), "throw new Error('must never execute')");
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var calls = new AtomicInteger();
        try {
            CurrentContractTestSchema.migrate(session, schema, "37");
            var scoped = ToolUnknownReviewFixture.scopedDataSource(schema);
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(scoped, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class).initializers(app -> {
                var beans = (GenericApplicationContext) app;
                beans.registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides);
                beans.registerBean("directoryModel", ModelClientSource.class, () -> new ModelClientSource() {
                    public ChatClient conversational(ModelConnectionSnapshot snapshot) {
                        return ChatClient.builder(FakeChatModels.scripted(prompt -> {
                            calls.incrementAndGet();
                            assertTrue(prompt.getUserMessage().getText().contains("Review the routing contract"));
                            assertTrue(prompt.getUserMessage().getText().contains("Keep host hash navigation"));
                            return FakeChatModels.text("Reviewed the selected text resources.");
                        })).build();
                    }
                    public ChatClient completion(ModelConnectionSnapshot snapshot) { throw new AssertionError("No completion path"); }
                }, definition -> definition.setPrimary(true));
            }).run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                    "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                    "--eap.web.allowed-origins=http://127.0.0.1:5198",
                    "--eap.ai.connection-store=" + session.resolve("connections.json"),
                    "--eap.ai.artifact-root=" + session.resolve("artifacts"))) {
                var models = context.getBean(ModelConnections.class);
                var model = models.create("Directory fixture", "https://127.0.0.1:9/v1", "fixture-key", true, true);
                models.configureModels(model.id(), List.of(new ModelOption("directory-fixture", List.of())), List.of("directory-fixture"), "directory-fixture");
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JsonMapper.builder().build().writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"),
                        "directory", directory.getParent().toString(), "invalidDirectory", invalid.toString())));
                var process = new ProcessBuilder("vp", "node", "apps/web/__tests__/browser/skill-directory-live.mjs", manifest.toString())
                        .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile()).inheritIO().start();
                try { assertTrue(process.waitFor(120, TimeUnit.SECONDS)); assertEquals(0, process.exitValue(), "Browser evidence: " + session); }
                finally { if (process.isAlive()) { process.descendants().forEach(ProcessHandle::destroyForcibly); process.destroyForcibly(); } }
                var skills = context.getBean(SkillService.class);
                var first = skills.get("directory-review", "1.0.0");
                var second = skills.get("directory-review", "1.1.0");
                assertEquals(raw, first.rawSkillMd());
                assertEquals("references/checks.md", first.resources().getFirst().path());
                assertNotEquals(first.digest(), second.digest());
                assertTrue(first.enabled()); assertFalse(second.enabled());
                assertNotNull(first.trust());
                var jdbc = new JdbcTemplate(scoped);
                assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM eap.skill_version", Integer.class));
                var chat = context.getBean(AiChatApplication.class);
                var conversation = chat.open("{}").conversationId();
                chat.send(conversation, JsonMapper.builder().build().writeValueAsString(Map.of("message", "Review the selected guide",
                        "toolMode", "none", "context", Map.of("mode", "chat", "skillRef", Map.of("id", first.id(),
                                "version", first.version(), "digest", first.digest(), "stateRevision", first.stateRevision()),
                                "skillResourcePaths", List.of("references/checks.md")))));
                assertEquals(1, calls.get());
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.code_generation", Integer.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution", Integer.class));
                Files.writeString(session.resolve("validation.json"), "{\"versions\":2,\"nestedPathsPreserved\":true,\"sourceConfirmed\":true,\"disabledByDefault\":true,\"activationRecovered\":true,\"exactModelMaterial\":true,\"model\":\"explicit Fake ChatModel\",\"toolExecutions\":0}");
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
