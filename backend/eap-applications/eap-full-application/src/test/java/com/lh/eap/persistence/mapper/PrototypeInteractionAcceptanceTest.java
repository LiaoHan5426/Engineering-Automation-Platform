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
    @Test void editsPreviewsPublishesAndReopensAnInteractiveDesign() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "prototype-interaction-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        Files.createDirectory(workspace.resolve("frontend"));
        Files.writeString(workspace.resolve("frontend/Form.vue"), "<template><h1>Current task form</h1></template>");
        Files.writeString(workspace.resolve("frontend/form.css"), ".task-form { display: grid; }");
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema, "37");
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
                        .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile()).inheritIO();
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
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.code_proposal",Integer.class));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task WHERE prototype_version_id IS NOT NULL",Integer.class));
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }
}
