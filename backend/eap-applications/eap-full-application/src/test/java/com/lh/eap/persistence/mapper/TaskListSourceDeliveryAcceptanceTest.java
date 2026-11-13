package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.EapApplication;
import com.lh.eap.ai.AiChatApplication;
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

/** Fresh real generation from the actual editor publication; isolated fixture Git baseline only. */
@EnabledIfEnvironmentVariable(named="EAP_TASK_LIST_SOURCE_DELIVERY", matches="true")
class TaskListSourceDeliveryAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    @Test void deliversThePublishedTaskListThroughTheProductionReviewAndVerificationPath() throws Exception {
        var store = Path.of(Objects.requireNonNull(System.getenv("EAP_TASK_LIST_CONNECTION_STORE"),
                "Explicit real model connection store required")).toRealPath();
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "task-list-source-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        browser("task-list-source-delivery-live.mjs", "prepare", workspace);
        var schema = "eap_unknown_qa_"+UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var source = ToolUnknownReviewFixture.scopedDataSource(schema);
            var override = new SourceWriteReviewPersistenceTest.Overrides(source, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext)app).registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> override))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.runtime.authorized-root="+workspace, "--eap.ai.connection-store="+store,
                            "--eap.ai.artifact-root="+session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5206,http://127.0.0.1:5208,http://127.0.0.1:5209")) {
                var backend = "http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port");
                var design = session.resolve("design");
                Files.createDirectory(design);
                var designManifest = design.resolve("host.json");
                Files.writeString(designManifest, JSON.writeValueAsString(Map.of("backend", backend)));
                browser("task-list-design-live.mjs", null, designManifest);
                var version = JSON.readTree(Files.readString(design.resolve("published-version.json")));
                var jdbc = new JdbcTemplate(source);
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version", Integer.class));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task", Integer.class));
                assertEquals(version.path("body").asString(), jdbc.queryForObject("SELECT body FROM eap.prototype_version", String.class));
                var taskId = jdbc.queryForObject("SELECT id FROM eap.board_task", UUID.class);
                var project = jdbc.queryForObject("SELECT project_id FROM eap.board_task", String.class);
                var tasks = context.getBean(BoardTaskService.class);
                var original = tasks.get(taskId, project);
                assertEquals("planned", original.column());
                assertEquals(version.path("id").asString(), original.prototypeVersionId().toString());
                var instructions = """
                    Deliver only frontend/src/TaskList.vue and frontend/src/task-list.css. main.ts already mounts TaskList.
                    Import './task-list.css' on a separate line. Implement the exact approved semantic task-list and its six original records, including every id, name, status, priority, summary, goal and acceptanceCriteria verbatim. Never substitute records or fetch data.
                    Reproduce the published Grapes project colors, spacing, typography and cards as closely as possible. This is an independent read-only task list, no editor toolbar or simulator banner.
                    Root data-testid=task-list-preview. Visible page heading 可筛选任务列表与只读详情.
                    Text input accessible name 任务名称, select accessible name 任务状态 (set aria-label="任务状态" explicitly; wrapping a select in a text label includes its option text in the accessible name), initial value all, options all/planned/ready/running/acceptance/done with Chinese labels 全部状态/规划中/待处理/进行中/待验收/已完成. Search trims whitespace and ignores case; name and status filters intersect.
                    Visible data-testid=task-list-count must show the exact matching count as 当前显示 N 个任务. Button 清空筛选 clears both. Empty text 没有匹配的任务 and button 重置筛选 restore both to initial values.
                    Each task has a button with accessible name 查看详情： plus its exact name. Detail is role=dialog aria-modal=true accessible name 任务详情, presenting status with the same Chinese labels as the filter and priority as its uppercase value (NONE/P0/P1/P2), presenting all seven fields, original goal and acceptanceCriteria as plain text preserving line breaks. It contains no input, textarea or select. Button 关闭详情 and Escape close, return focus to the opener and preserve filters. Closing the last task detail must also return focus to its opener. Focus is contained while open; backdrop does not obscure close controls.
                    At 1440 and 390 pixels no horizontal page/card/dialog overflow. Narrow layout stacks filters/cards, last task and close button remain reachable by vertical scrolling; dialog has bounded height with scrollable content. Use semantic HTML and accessible labels. All interactions stay local: no API writes or requests, no external assets, no AI, no mutation of original records.
                    """;
                var task = tasks.update(taskId, new BoardTaskService.Update(project, original.revision(), "ready", null, null,
                        "交付已发布的可筛选任务列表与只读详情", instructions));
                assertEquals(original.prototypeVersionId(), task.prototypeVersionId());
                var taskRef = Map.of("projectId", project, "taskId", taskId.toString(), "revision", task.revision());
                var paths = List.of("frontend/src/TaskList.vue", "frontend/src/task-list.css");
                var app = context.getBean(AiChatApplication.class);
                var conversation = app.open("{}").conversationId();
                var request = new LinkedHashMap<String,Object>();
                request.put("mode", "code"); request.put("expert", "frontend");
                request.put("approval", "review"); request.put("reasoning", "low");
                request.put("prototypeVersionId", task.prototypeVersionId().toString());
                request.put("targetPath", paths.getFirst()); request.put("componentPaths", paths.subList(1, paths.size()));
                request.put("taskRef", taskRef); request.put("instructions", instructions);
                request.put("files", List.of(Map.of("name", "read-only-host/frontend/src/main.ts", "content", Files.readString(workspace.resolve("frontend/src/main.ts")))));
                Files.writeString(session.resolve("real-model-request.json"), JSON.writeValueAsString(request));
                var result = app.send(conversation, JSON.writeValueAsString(Map.of("message",
                        "Implement the approved task list design, preserving all published records and accessible filter/detail behavior exactly. Return the selected two source files.",
                        "toolMode", "none", "context", request)));
                Files.writeString(session.resolve("real-model-result.json"), JSON.writeValueAsString(result));
                assertNotNull(result.proposal(), "Real model did not produce a candidate: "+session);
                var proposal = result.proposal();
                assertNotNull(proposal.generation(), "Candidate must retain its production generation snapshot");
                assertEquals(task.prototypeVersionId().toString(), proposal.generation().prototypeVersionId());
                assertEquals(new com.lh.eap.api.TaskRef(project, taskId, task.revision()), proposal.generation().taskBinding());
                assertFalse(proposal.applied(), "Generation must await explicit review and application");
                assertEquals(paths, proposal.files().stream().map(file -> file.path()).toList());
                for (var file : proposal.files())
                    assertEquals(file.before(), Files.readString(workspace.resolve(file.path())), "Generation must leave the source unapplied");
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JSON.writeValueAsString(Map.of("backend", backend, "workspace", workspace.toString(),
                        "task", taskRef, "proposal", proposal, "provider", "real configured model; fresh generation",
                        "design", version, "taskTitle", task.title())));
                browser("task-list-source-delivery-live.mjs", "deliver", manifest);
                assertEquals(version.path("body").asString(), jdbc.queryForObject("SELECT body FROM eap.prototype_version", String.class),
                        "Source delivery must leave the approved immutable design untouched");
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version", Integer.class));
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }

    private static void browser(String script, String mode, Path input) throws Exception {
        var frontend = Path.of(System.getenv().getOrDefault("EAP_ACCEPTANCE_FRONTEND",
                Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toString()));
        var args = new ArrayList<>(List.of("node", "apps/web/__tests__/browser/"+script));
        if (mode != null) args.add(mode);
        args.add(input.toString());
        var command = new ProcessBuilder(args).directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_") || key.equals("SPRING_DATASOURCE_PASSWORD"));
        var process = command.start();
        try {
            assertTrue(process.waitFor(300, TimeUnit.SECONDS), "Browser phase timed out: "+script+" "+input);
            assertEquals(0, process.exitValue(), "Browser phase failed: "+script+" "+input);
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
