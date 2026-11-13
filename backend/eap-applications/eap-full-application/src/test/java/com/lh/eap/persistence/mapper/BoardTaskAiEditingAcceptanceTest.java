package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.EapApplication;
import com.lh.eap.application.service.BoardTaskService;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Real Boot, current V1 and provider; owns only its UUID schema. Browser checkpoints read SQL live. */
@EnabledIfEnvironmentVariable(named = "EAP_BOARD_AI_EDITING", matches = "true")
class BoardTaskAiEditingAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Test void explicitlyAdoptsThenSavesAndReviewsRealRevisionConflicts() throws Exception {
        var store = Path.of(Objects.requireNonNull(System.getenv("EAP_BOARD_AI_CONNECTION_STORE"),
                "Set EAP_BOARD_AI_CONNECTION_STORE to the explicit root .eap/model-connections.json")).toRealPath();
        assertTrue(Files.isRegularFile(store));
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "board-ai-editing-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var project = "board-edit-ai-" + UUID.randomUUID();
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
                            "--eap.runtime.authorized-root=" + workspace, "--eap.ai.connection-store=" + store,
                            "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5204")) {
                var service = context.getBean(BoardTaskService.class);
                var seed = service.create(new BoardTaskService.Draft(project, "已有任务目标优化验收", "", "ready",
                        "改善任务看板的已有任务详情。\n目标描述由用户确认采用后再保存。",
                        "保留多行验收标准\n保存后可重新打开\n没有启动执行", UUID.randomUUID()));
                seed = service.update(seed.id(), new BoardTaskService.Update(project, seed.revision(), null,
                        "原始备注\n应保留", "p1", null, null));
                var other = service.create(new BoardTaskService.Draft(project, "切换目标隔离任务", "", "planned",
                        "另一任务的原始目标", "另一任务验收", UUID.randomUUID()));
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JSON.writeValueAsString(Map.of(
                        "backend", "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"),
                        "project", project, "workspace", workspace.toString(), "task", seed, "other", other)));
                Files.writeString(session.resolve("provider.json"), JSON.writeValueAsString(
                        context.getBean(com.lh.eap.ai.ModelConnections.class).list()));
                var jdbc = new JdbcTemplate(scoped);
                browser(manifest, jdbc, project);
                var expected = JSON.readTree(Files.readString(session.resolve("editing.json")));
                var actual = service.get(seed.id(), project);
                var checks = new LinkedHashMap<String, Boolean>();
                checks.put("goal", actual.goal().equals(expected.path("goal").asString()));
                checks.put("criteria", actual.acceptanceCriteria().equals(expected.path("acceptanceCriteria").asString()));
                checks.put("notes", actual.notes().equals(expected.path("notes").asString()));
                checks.put("priority", actual.priority().equals(expected.path("priority").asString()));
                checks.put("revision", actual.revision() == expected.path("revision").asLong());
                checks.put("otherUntouched", service.get(other.id(), project).equals(other));
                checks.put("twoTasks", jdbc.queryForObject("SELECT count(*) FROM eap.board_task WHERE project_id=?", Integer.class, project) == 2);
                checks.put("zeroRuns", jdbc.queryForObject("SELECT count(*) FROM eap.board_task_run", Integer.class) == 0);
                checks.put("zeroExecutions", jdbc.queryForObject("SELECT count(*) FROM eap.mission_execution", Integer.class) == 0);
                Files.writeString(session.resolve("readback.json"), JSON.writeValueAsString(Map.of(
                        "actual", actual, "other", other, "checks", checks, "ownedSchema", schema)));
                assertTrue(checks.values().stream().allMatch(Boolean::booleanValue), "DB checks: " + checks);
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private static void browser(Path manifest, JdbcTemplate jdbc, String project) throws Exception {
        var frontend = Path.of(System.getenv().getOrDefault("EAP_ACCEPTANCE_FRONTEND",
                Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toString()));
        var command = new ProcessBuilder("node", "apps/web/__tests__/browser/board-task-ai-editing-live.mjs", manifest.toString())
                .directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_") || key.startsWith("SPRING_DATASOURCE_")
                || key.equals("EAP_BOARD_AI_CONNECTION_STORE"));
        var process = command.start();
        var snapshots = new ArrayList<Object>();
        var last = "";
        var requestFile = manifest.getParent().resolve("checkpoint-request.json");
        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(300);
        try {
            while (process.isAlive() && System.nanoTime() < deadline) {
                if (Files.exists(requestFile)) {
                    var request = JSON.readTree(Files.readString(requestFile));
                    var stage = request.path("stage").asString();
                    if (!stage.equals(last)) {
                        var row = jdbc.queryForMap("SELECT id,goal,acceptance_criteria,notes,priority,revision FROM eap.board_task WHERE id=? AND project_id=?",
                                UUID.fromString(request.path("id").asString()), project);
                        var snapshot = Map.of("stage", stage, "row", row);
                        snapshots.add(snapshot);
                        Files.writeString(manifest.getParent().resolve("db-checkpoints.json"), JSON.writeValueAsString(snapshots));
                        var temporary = manifest.getParent().resolve("checkpoint-response.tmp");
                        Files.writeString(temporary, JSON.writeValueAsString(snapshot));
                        Files.move(temporary, manifest.getParent().resolve("checkpoint-response.json"), StandardCopyOption.REPLACE_EXISTING);
                        last = stage;
                    }
                }
                process.waitFor(100, TimeUnit.MILLISECONDS);
            }
            assertFalse(process.isAlive(), "Browser timed out; evidence: " + manifest.getParent());
            assertEquals(0, process.exitValue(), "Browser failed; evidence: " + manifest.getParent());
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
