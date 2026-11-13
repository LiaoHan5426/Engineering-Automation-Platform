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

/** Real App + provider acceptance. Never uses an existing application schema or workspace. */
@EnabledIfEnvironmentVariable(named = "EAP_BOARD_AI_CREATION", matches = "true")
class BoardTaskAiCreationAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test void createsReviewedDraftsAndRecoversTheSameRequestAfterResponseLoss() throws Exception {
        var store = Path.of(Objects.requireNonNull(System.getenv("EAP_BOARD_AI_CONNECTION_STORE"),
                "Set EAP_BOARD_AI_CONNECTION_STORE to the explicit root .eap/model-connections.json")).toRealPath();
        assertTrue(Files.isRegularFile(store));
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "board-ai-creation-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var project = "board-ai-" + UUID.randomUUID();
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var scoped = ToolUnknownReviewFixture.scopedDataSource(schema);
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(scoped, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext) app).registerBean(
                            SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.runtime.authorized-root=" + workspace,
                            "--eap.ai.connection-store=" + store,
                            "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5203")) {
                // Public connection views contain provider/model identity, never API credentials.
                Files.writeString(session.resolve("provider.json"), JSON.writeValueAsString(
                        context.getBean(com.lh.eap.ai.ModelConnections.class).list()));
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JSON.writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"),
                        "project", project, "workspace", workspace.toString())));
                browser(manifest);
                var creation = JSON.readTree(Files.readString(session.resolve("creation.json")));
                var jdbc = new JdbcTemplate(scoped);
                var tasks = context.getBean(com.lh.eap.application.service.BoardTaskService.class);
                var rows = new ArrayList<Object>();
                for (var item : creation.path("tasks")) {
                    var id = UUID.fromString(item.path("id").asString());
                    var task = tasks.get(id, project);
                    assertEquals(item.path("title").asString(), task.title());
                    assertEquals(item.path("goal").asString(), task.goal());
                    assertEquals(item.path("acceptanceCriteria").asString(), task.acceptanceCriteria());
                    assertEquals(item.path("column").asString(), task.column());
                    assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task WHERE project_id=? AND request_id=?",
                            Integer.class, project, UUID.fromString(item.path("requestId").asString())));
                    rows.add(task);
                }
                assertEquals(3, rows.size(), "ready, lost-response retry and planned-empty drafts");
                assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM eap.board_task WHERE project_id=?", Integer.class, project));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.board_task_run", Integer.class));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution", Integer.class));
                Files.writeString(session.resolve("readback.json"), JSON.writeValueAsString(Map.of(
                        "tasks", rows, "ownedSchema", schema, "taskCount", 3, "runs", 0, "missionExecutions", 0)));
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private static void browser(Path manifest) throws Exception {
        var frontend = Path.of(System.getenv().getOrDefault("EAP_ACCEPTANCE_FRONTEND",
                Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toString()));
        var command = new ProcessBuilder("node", "apps/web/__tests__/browser/board-task-ai-creation-live.mjs", manifest.toString())
                .directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_") || key.startsWith("SPRING_DATASOURCE_")
                || key.equals("EAP_BOARD_AI_CONNECTION_STORE"));
        var process = command.start();
        try {
            assertTrue(process.waitFor(240, TimeUnit.SECONDS), "Browser timed out; evidence: " + manifest.getParent());
            assertEquals(0, process.exitValue(), "Browser failed; evidence: " + manifest.getParent());
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
