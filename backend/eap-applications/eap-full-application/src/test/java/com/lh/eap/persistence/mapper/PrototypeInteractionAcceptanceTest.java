package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.EapApplication;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Actual designer, preview, HTTP publication and persistence. All schema and files are test-owned. */
@EnabledIfEnvironmentVariable(named="EAP_PROTOTYPE_INTERACTION_CHROMIUM", matches="true")
class PrototypeInteractionAcceptanceTest {
    private static Path frontendDirectory() {
        var configured = System.getenv("EAP_ACCEPTANCE_FRONTEND");
        return configured == null || configured.isBlank()
                ? Path.of("../../..").toAbsolutePath().normalize().resolve("frontend")
                : Path.of(configured).toAbsolutePath().normalize();
    }

    private static void collectTextareas(tools.jackson.databind.JsonNode node, List<tools.jackson.databind.JsonNode> fields) {
        if ("textarea".equals(node.path("kind").asString())) fields.add(node);
        for (var child : node.path("children")) collectTextareas(child, fields);
    }

    @Test void editsPreviewsPublishesAndReopensAnInteractiveDesign() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "prototype-interaction-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        Files.createDirectory(workspace.resolve("frontend"));
        Files.writeString(workspace.resolve("frontend/Form.vue"), "<template><h1>Current task form</h1></template>");
        Files.writeString(workspace.resolve("frontend/form.css"), ".task-form { display: grid; }");
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var source = ToolUnknownReviewFixture.scopedDataSource(schema);
            var override = new SourceWriteReviewPersistenceTest.Overrides(source, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext)app).registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> override))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.ai.connection-store="+session.resolve("connections.json"),
                            "--eap.ai.artifact-root="+session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5194")) {
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JsonMapper.builder().build().writeValueAsString(Map.of(
                        "backend","http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port"))));
                var command = new ProcessBuilder("node","apps/web/__tests__/browser/prototype-interaction-live.mjs",manifest.toString())
                        .directory(frontendDirectory().toFile()).inheritIO();
                command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_"));
                var process = command.start();
                try {
                    assertTrue(process.waitFor(180, TimeUnit.SECONDS), "Browser timed out: "+session);
                    assertEquals(0,process.exitValue(), "Browser failed: "+session);
                } finally {
                    if (process.isAlive()) {
                        process.descendants().forEach(ProcessHandle::destroyForcibly);
                        process.destroyForcibly();
                    }
                }
                var jdbc = new JdbcTemplate(source);
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version",Integer.class));
                var body = jdbc.queryForObject("SELECT body FROM eap.prototype_version", String.class);
                var root = JsonMapper.builder().build().readTree(body).path("schema").path("root");
                var multiline = new ArrayList<tools.jackson.databind.JsonNode>();
                collectTextareas(root, multiline);
                assertEquals(1, multiline.size(), "Published design must retain its multiline field kind");
                var props = multiline.getFirst().path("props");
                assertEquals("任务说明", props.path("label").asString());
                assertEquals("填写任务说明", props.path("placeholder").asString());
                assertEquals("第一行说明\n第二行说明", props.path("initialValue").asString());
                assertTrue(props.path("required").asBoolean());
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.code_proposal",Integer.class));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task WHERE prototype_version_id IS NOT NULL",Integer.class));
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }
}
