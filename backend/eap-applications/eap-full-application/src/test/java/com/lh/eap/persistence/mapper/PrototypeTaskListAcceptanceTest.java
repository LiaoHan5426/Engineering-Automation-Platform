package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.EapApplication;
import com.lh.eap.application.service.SemanticPrototype;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in real editor publication, scoped persistence and immutable design readback; no generation. */
@EnabledIfEnvironmentVariable(named="EAP_TASK_LIST_DESIGN_CHROMIUM", matches="true")
class PrototypeTaskListAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private static Path frontendDirectory() {
        var configured = System.getenv("EAP_ACCEPTANCE_FRONTEND");
        return configured == null || configured.isBlank()
                ? Path.of("../../..").toAbsolutePath().normalize().resolve("frontend")
                : Path.of(configured).toAbsolutePath().normalize();
    }

    private static void collectTaskLists(JsonNode node, List<JsonNode> lists) {
        if ("task-list".equals(node.path("kind").asString())) lists.add(node);
        for (var child : node.path("children")) collectTaskLists(child, lists);
    }

    @Test void publishesAndReopensTheActualTaskListDesignWithoutExecution() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "task-list-design-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        Files.createDirectory(workspace.resolve("frontend"));
        Files.writeString(workspace.resolve("frontend/Tasks.vue"), "<template><h1>Task list design</h1></template>");
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
                            "--eap.web.allowed-origins=http://127.0.0.1:5206")) {
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JSON.writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port"))));
                var command = new ProcessBuilder("node", "apps/web/__tests__/browser/task-list-design-live.mjs", manifest.toString())
                        .directory(frontendDirectory().toFile()).inheritIO();
                command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_"));
                var process = command.start();
                try {
                    assertTrue(process.waitFor(240, TimeUnit.SECONDS), "Browser timed out: "+session);
                    assertEquals(0, process.exitValue(), "Browser failed: "+session);
                } finally {
                    if (process.isAlive()) {
                        process.descendants().forEach(ProcessHandle::destroyForcibly);
                        process.destroyForcibly();
                    }
                }
                var jdbc = new JdbcTemplate(source);
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version", Integer.class));
                var body = jdbc.queryForObject("SELECT body FROM eap.prototype_version", String.class);
                Files.writeString(session.resolve("readback.json"), body);
                SemanticPrototype.require(body);
                var published = JSON.readTree(body);
                var expected = JSON.readTree(Files.readString(session.resolve("expected-publication.json")));
                assertEquals(expected, published, "Stored semantic and Grapes design must equal the actual browser publication");
                var lists = new ArrayList<JsonNode>();
                collectTaskLists(published.path("schema").path("root"), lists);
                assertEquals(1, lists.size(), "Design must contain exactly one task-list");
                var records = lists.getFirst().path("props").path("items");
                assertEquals(6, records.size());
                for (var record : records) {
                    assertTrue(record.path("name").asString().codePoints().anyMatch(c -> Character.UnicodeScript.of(c) == Character.UnicodeScript.HAN),
                            "Original Chinese task names must survive publication");
                }
                var grapes = published.path("schema").path("grapesProject");
                assertTrue(grapes.isObject() && !grapes.isEmpty(), "Actual editable Grapes project must survive");
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task", Integer.class));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task t JOIN eap.prototype_version v ON v.id=t.prototype_version_id WHERE t.column_id='planned'", Integer.class));
                for (var table : List.of("code_proposal", "board_task_run", "mission_execution", "tool_execution"))
                    assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap."+table, Integer.class), "Design acceptance must leave "+table+" empty");
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }
}
