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

@EnabledIfEnvironmentVariable(named = "EAP_SCENARIO_SKILL_CHROMIUM", matches = "true")
class ScenarioSkillAcceptanceTest {
    @Test void configuresAndUsesAnExplicitScenarioSkillVersion() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "scenario-skill-");
        var workspace = Files.createDirectory(session.resolve("workspace"));
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var calls = new AtomicInteger();
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
                            calls.incrementAndGet();
                            assertTrue(prompt.getUserMessage().getText().contains("Review the routing contract"));
                            assertTrue(prompt.getSystemMessage().getText().contains("Scenario-specific instructions"));
                            assertTrue(prompt.getUserMessage().getText().contains("Keep host hash navigation"));
                            return FakeChatModels.text("Reviewed the selected text resources.");
                        })).build();
                    }
                    public ChatClient completion(ModelConnectionSnapshot snapshot) { throw new AssertionError("No completion path"); }
                }, definition -> definition.setPrimary(true));
            }).run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                    "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                    "--eap.web.allowed-origins=http://127.0.0.1:5199",
                    "--eap.ai.connection-store=" + session.resolve("connections.json"),
                    "--eap.ai.artifact-root=" + session.resolve("artifacts"))) {
                var models = context.getBean(ModelConnections.class);
                var model = models.create("Directory fixture", "https://127.0.0.1:9/v1", "fixture-key", true, true);
                models.configureModels(model.id(), List.of(new ModelOption("directory-fixture", List.of())), List.of("directory-fixture"), "directory-fixture");
                var skills = context.getBean(SkillService.class);
                for (String version : List.of("1.0.0", "1.1.0")) {
                    var input = Map.of("rawSkillMd", "---\nname: directory-review\ndescription: Review routing\n---\nReview the routing contract.",
                            "version", version, "sourceLabel", "Scenario fixture", "requiredCapabilities", List.of(),
                            "resources", List.of(Map.of("path", "references/checks.md", "mediaType", "text/markdown", "content", "Keep host hash navigation.")));
                    var preview = skills.preview(input);
                    var saved = skills.save(Map.of("input", input, "expectedDigest", preview.digest(), "confirmed", true));
                    if (version.equals("1.0.0")) skills.activate(saved.id(), saved.version(), Map.of("enabled", true, "stateRevision", saved.stateRevision()));
                }
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JsonMapper.builder().build().writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"))));
                var process = new ProcessBuilder("vp", "node", "apps/web/__tests__/browser/scenario-skill-live.mjs", manifest.toString())
                        .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile()).inheritIO().start();
                try { assertTrue(process.waitFor(120, TimeUnit.SECONDS)); assertEquals(0, process.exitValue(), "Browser evidence: " + session); }
                finally { if (process.isAlive()) { process.descendants().forEach(ProcessHandle::destroyForcibly); process.destroyForcibly(); } }
                var jdbc = new JdbcTemplate(scoped);
                var scene = context.getBean(com.lh.eap.application.service.ScenarioService.class).list().getFirst();
                assertEquals(List.of("directory-review"), scene.definition().skills());
                assertEquals("Scenario-specific instructions", scene.definition().instructions());
                assertEquals(1, calls.get());
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.code_generation", Integer.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution", Integer.class));
                Files.writeString(session.resolve("validation.json"), "{\"scenarioPersisted\":true,\"exactModelMaterial\":true,\"modelCalls\":1,\"model\":\"explicit Fake ChatModel\",\"toolExecutions\":0}");
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }
}
