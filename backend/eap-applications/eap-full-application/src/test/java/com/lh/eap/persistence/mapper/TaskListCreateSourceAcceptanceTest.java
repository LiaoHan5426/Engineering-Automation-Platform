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
@EnabledIfEnvironmentVariable(named="EAP_TASK_LIST_CREATE_SOURCE_DELIVERY", matches="true")
class TaskListCreateSourceAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    @Test void deliversThePublishedTaskListThroughTheProductionReviewAndVerificationPath() throws Exception {
        var store = Path.of(Objects.requireNonNull(System.getenv("EAP_TASK_LIST_CREATE_CONNECTION_STORE"),
                "Explicit real model connection store required")).toRealPath();
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "task-list-create-source-live-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        browser("task-list-create-source-live.mjs", "prepare", workspace);
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
                browser("task-list-create-live.mjs", null, designManifest);
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
                    Deliver ONLY frontend/src/TaskList.vue and frontend/src/task-list.css; main.ts mounts TaskList. Import './task-list.css'. Use Vue3 TypeScript strict. Preserve published records and styles verbatim. No external assets or startup HTTP. Root task-list-preview, heading 可筛选任务列表与只读详情. Name filter label 任务名称; status select aria-label 任务状态 options all/planned/ready/running/acceptance/done. Intersect trimmed case-insensitive search and status. task-list-count displays count. 清空筛选 and empty 重置筛选 reset filters. Rows li[data-task-id], button 查看详情：NAME opens dialog 任务详情 with seven fields and 关闭详情; restore opener focus after DOM update and removal of inert. task-edit-open opens local detail editor with task-edit-goal/task-edit-acceptanceCriteria, task-edit-save/task-edit-cancel. Same local record store supports created records; reload resets publication.
                    Published props.creatable=true independently enables 新增任务 button task-create-open, including zero filter matches via task-create-empty. data-testid task-edit-dialog title 新增任务, inputs task-edit-name, task-edit-goal, task-edit-acceptanceCriteria; required nonblank name <=120 and both goals <=2000. Allow typing over limits then Save rejects, aria-invalid and focus first invalid. AI disabled for either invalid goal or acceptanceCriteria; name validation gates Save only. Initially name focused. task-edit-save 保存新增 and task-edit-cancel 取消. Visible header close button aria-label 关闭编辑 uses the same dirty guard. Save creates once ID 'LOCAL-'+crypto.randomUUID unique across the store (contract /^[A-Za-z][A-Za-z0-9_-]{0,79}$/), status planned priority none summary empty, inserts top and clears filters. Show planned as 规划中 or 计划中 in rows/details; keep stored codes unchanged. Total store capacity30 including published+new records; disable create at30. Clean cancel/close/Escape close, dirty confirmation .eap-confirm title 放弃未保存的更改？ buttons 放弃更改 and 继续编辑[data-confirm-cancel]. Continue preserves draft; discard changes no records; same-value restore clean. Focus trapped and restored to opener. Local memory only; no business writes.
                    AI selectors shared by edit/create: task-ai-optimize AI优化, task-ai-adopt 采用建议, task-ai-keep 保留原文, task-ai-cancel 取消优化. Use REAL HTTP POST /api/ai/task-detail/optimizations/{crypto.randomUUID()} JSON {goal,acceptanceCriteria}, validate 200 response {goal,acceptanceCriteria,connectionId,model}. Guard both invalid goal fields before UUID/request; invalidate pending work on any draft field change including name ABA. Suggestions task-ai-goal/task-ai-criteria do not mutate draft until adopt; adopt BOTH goal fields preserving name, Save then commits once. Cancel/close/change immediately invalidate monotonic epoch and AbortController, DELETE same UUID expects204; ignore late results even ABA. Keep original discards suggestion. Never hardcode model response. AI purple with aria-hidden sparkle, Cancel white, Save green; footer one row1440/390; bounded scroll at390x600, no horizontal overflow, keyboard focus trap. No API outside optimization; refresh restores exactly initial publication. Keep editable and creatable independent.
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
                var answerDeltas = new StringBuilder();
                var result = app.send(conversation, JSON.writeValueAsString(Map.of("message",
                        "Implement the approved task list design, preserving all published records and accessible filter/detail behavior exactly. Return the selected two source files.",
                        "toolMode", "none", "context", request)), event -> {
                    if ("answer.delta".equals(event.type())) answerDeltas.append(event.text());
                });
                Files.writeString(session.resolve("real-code-answer.txt"), answerDeltas.toString());
                Files.writeString(session.resolve("real-model-result.json"), JSON.writeValueAsString(result));
                assertNotNull(result.proposal(), "Real model did not produce a candidate: "+session);
                var proposal = result.proposal();
                var answerJson = answerDeltas.toString().strip();
                if (answerJson.startsWith("```json\n") || answerJson.startsWith("```\n")) {
                    assertTrue(answerJson.endsWith("```"));
                    answerJson = answerJson.substring(answerJson.indexOf('\n') + 1, answerJson.length() - 3).strip();
                }
                var answer = JSON.readTree(answerJson);
                var hashes = new LinkedHashMap<String,String>();
                for (var file : proposal.files()) {
                    String decoded = null;
                    for (var item : answer.path("files")) if (file.path().equals(item.path("path").asString())) decoded = item.path("content").asString();
                    assertEquals(decoded, file.content(), "Decoded real answer must equal persisted candidate");
                    hashes.put(file.path(), java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(file.content().getBytes(java.nio.charset.StandardCharsets.UTF_8))));
                }
                var vue = proposal.files().getFirst().content();
                assertFalse(vue.toLowerCase().contains("[redacted"));
                Files.writeString(session.resolve("answer-candidate-hashes.json"), JSON.writeValueAsString(hashes));
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
                browser("task-list-create-source-live.mjs", "deliver", manifest);
                var changes = context.getBean(com.lh.eap.delivery.CodeChangeService.class);
                var preparation = changes.inspectPreparation(paths.getFirst(), paths.subList(1, paths.size()));
                assertEquals(paths, preparation.files().stream().map(file -> file.path()).toList());
                var references = changes.inspectReferences(paths);
                for (var reference : references) assertEquals(Files.readString(workspace.resolve(reference.path())), reference.excerpt());
                Files.writeString(session.resolve("next-source-inspection.json"), JSON.writeValueAsString(Map.of("preparation", preparation, "references", references)));
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
            assertEquals(0, admin.queryForObject("SELECT count(*) FROM information_schema.schemata WHERE schema_name=?", Integer.class, schema));
            Files.writeString(session.resolve("cleanup.json"), JSON.writeValueAsString(Map.of("ownedSchema", schema, "dropped", true)));
            assertEquals(0, admin.queryForObject("SELECT count(*) FROM pg_namespace WHERE nspname = ?", Integer.class, schema));
            Files.writeString(session.resolve("schema-cleanup.json"), JSON.writeValueAsString(Map.of("schema", schema, "remainingSchemas", 0)));
        }
    }

    private static void browser(String script, String mode, Path input) throws Exception {
        var frontend = Path.of(System.getenv().getOrDefault("EAP_ACCEPTANCE_FRONTEND",
                Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toString()));
        var args = new ArrayList<>(List.of("node", "apps/web/__tests__/browser/"+script));
        if (mode != null) args.add(mode);
        args.add(input.toString());
        var command = new ProcessBuilder(args).directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_") || key.equals("SPRING_DATASOURCE_PASSWORD") || key.equals("EAP_TASK_LIST_CREATE_CONNECTION_STORE"));
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
