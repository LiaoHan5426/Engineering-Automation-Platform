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
@EnabledIfEnvironmentVariable(named="EAP_TASK_DETAIL_EDIT_SOURCE_DELIVERY", matches="true")
class TaskDetailEditSourceAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    @Test void deliversThePublishedTaskListThroughTheProductionReviewAndVerificationPath() throws Exception {
        var store = Path.of(Objects.requireNonNull(System.getenv("EAP_TASK_DETAIL_CONNECTION_STORE"),
                "Explicit real model connection store required")).toRealPath();
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "task-detail-edit-source-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        browser("task-detail-edit-source-live.mjs", "prepare", workspace);
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
                browser("task-detail-edit-live.mjs", null, designManifest);
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
                    Match published colors/spacing/typography/cards; no editor toolbar or simulator banner.
                    Root data-testid=task-list-preview. Visible page heading 可筛选任务列表与只读详情.
                    Text input accessible name 任务名称, select accessible name 任务状态 (explicit aria-label="任务状态"), initial value all, options all/planned/ready/running/acceptance/done with Chinese labels 全部状态/规划中/待处理/进行中/待验收/已完成. Search trims whitespace and ignores case; name and status filters intersect.
                    Visible data-testid=task-list-count must show the exact matching count as 当前显示 N 个任务. Button 清空筛选 clears both. Empty text 没有匹配的任务 and button 重置筛选 restore both to initial values.
                    Each task has a button accessible name 查看详情： plus exact name. Detail role=dialog aria-modal=true name 任务详情 presents the seven original fields. It has button 关闭详情 and data-testid=task-edit-open 编辑详情. Close/Escape return focus to the task opener.
                    Published props.editable=true explicitly enables local editing. Use independent per-record cloned preview memory. Editing dialog data-testid=task-edit-dialog, accessible title 编辑任务详情, has two labeled textareas data-testid=task-edit-goal and task-edit-acceptanceCriteria. Focus goal initially. Both fields required nonblank and maximum 2000 characters; allow typing 2001 then reject Save, show aria-invalid=true and focus first invalid field. Save button task-edit-save 保存更改 validates and changes only preview memory. No board writes and no persistence. task-edit-cancel 取消, close button with data-eap-dialog-close, and Escape return to readonly detail when clean; dirty shows role=dialog class=eap-confirm title 放弃未保存的更改？ with buttons 放弃更改 and 继续编辑 (attribute data-confirm-cancel). Continue retains drafts; discard leaves records unchanged. Same-value restore is clean. Each record isolated. Reload restores publication records.
                    Footer AI button task-ai-optimize AI优化 has purple-tinted background/border and aria-hidden sparkle icon, distinct from white Cancel task-edit-cancel and green Save task-edit-save; provide hover/focus-visible/disabled styling. All three buttons share one row at BOTH 1440 and 390 with reachable non-overflowing boxes. Dialog content bounded height with vertical scrolling, no horizontal overflow. Modal focus trapped.
                    AI optimization MUST be disabled when EITHER input is blank/whitespace-only or longer than 2000 characters, enabled when both inputs are valid. Guard optimize() before allocating UUID or issuing HTTP; invalid input must send no request. REAL API ONLY: clicking AI POST /api/ai/task-detail/optimizations/{crypto.randomUUID()} with JSON {goal,acceptanceCriteria}, Content-Type application/json, no optional undefined fields. 200 JSON {goal,acceptanceCriteria,connectionId,model}; validate both strings required <=2000. Do not invent, simulate, duplicate or hardcode model suggestions. Display two suggestions task-ai-goal/task-ai-criteria, explicit button task-ai-adopt 采用建议 changes BOTH draft fields only, no current record mutation; task-ai-keep 保留原文 discards suggestion. Pending button task-ai-cancel 取消优化 aborts transport and DELETE same UUID endpoint expecting 204. Draft changes/close invalidate pending by monotonic requestEpoch/capturedEpoch counters, cancel same UUID, ignore late results including ABA. Use requestEpoch/capturedEpoch numeric counter names, never token. Show errors locally. AI needs one real call in built browser only; no startup calls. No external assets. Server already proxies /api to real backend.
                    """;
                assertTrue(instructions.length() <= 4000, "Fixture instructions must fit board acceptanceCriteria");
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
                browser("task-detail-edit-source-live.mjs", "deliver", manifest);
                assertEquals(version.path("body").asString(), jdbc.queryForObject("SELECT body FROM eap.prototype_version", String.class),
                        "Source delivery must leave the approved immutable design untouched");
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version", Integer.class));
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM eap.board_task", Integer.class));
                Files.writeString(session.resolve("readback.json"), JSON.writeValueAsString(Map.of(
                        "ownedSchema", schema, "versionBody", jdbc.queryForObject("SELECT body FROM eap.prototype_version", String.class),
                        "task", tasks.get(taskId, project))));
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
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_") || key.equals("SPRING_DATASOURCE_PASSWORD") || key.equals("EAP_TASK_DETAIL_CONNECTION_STORE"));
        var process = command.start();
        try {
            assertTrue(process.waitFor(420, TimeUnit.SECONDS), "Browser phase timed out: "+script+" "+input);
            assertEquals(0, process.exitValue(), "Browser phase failed: "+script+" "+input);
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
