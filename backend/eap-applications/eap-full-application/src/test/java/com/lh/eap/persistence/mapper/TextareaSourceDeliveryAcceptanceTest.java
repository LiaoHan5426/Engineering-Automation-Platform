package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.EapApplication;
import com.lh.eap.api.TaskRef;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.CodeChangeService;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Opt-in real provider, owned schema/workspace, explicit application and independent verification. */
@EnabledIfEnvironmentVariable(named="EAP_TEXTAREA_SOURCE_DELIVERY", matches="true")
class TextareaSourceDeliveryAcceptanceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    @Test void deliversTheConfirmedMultilineFormAndRealOptimization() throws Exception {
        var capturedSetting = System.getenv("EAP_TEXTAREA_CAPTURED_RESULT");
        var replay = capturedSetting != null && !capturedSetting.isBlank();
        var capturedPath = replay ? Path.of(capturedSetting).toRealPath() : null;
        if (replay) assertTrue(Files.isRegularFile(capturedPath), "Explicit captured result must be a regular file");
        var store = Path.of(Objects.requireNonNull(System.getenv("EAP_TEXTAREA_CONNECTION_STORE"),
                "An explicitly configured local model connection store is required")).toRealPath();
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "textarea-source-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        browser("prepare", workspace);
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var override = new SourceWriteReviewPersistenceTest.Overrides(
                    ToolUnknownReviewFixture.scopedDataSource(schema), workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext)app).registerBean(
                            SourceWriteReviewPersistenceTest.Overrides.class, () -> override))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.runtime.authorized-root="+workspace,
                            "--eap.ai.connection-store="+store,
                            "--eap.ai.artifact-root="+session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5196,http://127.0.0.1:5197")) {
                var backend = "http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port");
                var setup = session.resolve("setup.json");
                Files.writeString(setup, JSON.writeValueAsString(Map.of("backend",backend)));
                browser("setup", setup);
                var inputs = JSON.readTree(Files.readString(session.resolve("inputs.json")));
                var paths = new ArrayList<String>();
                for (var path : inputs.path("paths")) paths.add(path.asString());
                assertEquals(List.of("frontend/src/TaskForm.vue", "frontend/src/task-form.css"), paths);
                var task = Map.of("projectId", inputs.path("project").asString(),
                        "taskId", inputs.path("taskId").asString(), "revision", inputs.path("revision").asLong());
                var app = context.getBean(com.lh.eap.ai.AiChatApplication.class);
                var conversation = app.open("{}").conversationId();
                var request = new LinkedHashMap<String,Object>();
                request.put("mode","code"); request.put("expert","frontend");
                request.put("approval","review"); request.put("reasoning","low");
                request.put("prototypeVersionId", inputs.path("prototypeId").asString());
                request.put("targetPath",paths.getFirst()); request.put("componentPaths",paths.subList(1,paths.size()));
                request.put("taskRef",task);
                request.put("files", List.of(Map.of("name","read-only-host/frontend/src/main.ts",
                        "content",Files.readString(workspace.resolve("frontend/src/main.ts"))),
                        Map.of("name","read-only-host/frontend/src/optimization.ts",
                        "content",Files.readString(workspace.resolve("frontend/src/optimization.ts")))));
                request.put("instructions", "Implement only the two selected source files. Import './task-form.css' on its own line. "
                        + "Preserve the exact approved task form and its multiline semantics. Do not modify the host or install dependencies. "
                        + "Import runtimeApi from '@eap/runtime-client' for real optimization requests, following the read-only optimization.ts API examples without importing that unselected file. No fabricated AI output, timers, extra endpoints, or automatic adoption. "
                        + inputs.path("interactionInstructions").asString());
                CodeChangeService.Proposal proposal;
                if (replay) {
                    // Explicit captured output, new snapshot/task/version/conversation binding; no generation fallback.
                    Files.copy(capturedPath, session.resolve("captured-model-result.json"));
                    var capturedResult = JSON.readTree(Files.readString(session.resolve("captured-model-result.json")));
                    var captured = capturedResult.path("proposal").path("files");
                    var replayContext = new LinkedHashMap<String,Object>();
                    replayContext.put("capturedResult",capturedPath.toString());
                    replayContext.put("capturedProposalId",capturedResult.path("proposal").path("id").asString());
                    replayContext.put("conversationId",conversation);
                    replayContext.put("workspace",workspace.toString());
                    replayContext.put("context",request);
                    replayContext.put("provider","captured real model output; new binding; not new generation");
                    Files.writeString(session.resolve("captured-replay-context.json"),JSON.writeValueAsString(replayContext));
                    assertNotEquals(capturedResult.path("proposal").path("conversationId").asString(),conversation.toString(),
                            "Replay must use a fresh conversation");
                    assertNotEquals(capturedResult.path("proposal").path("workspace").asString(),workspace.toString(),
                            "Replay must use a fresh workspace");
                    assertTrue(captured.isArray(),"Captured result must contain a proposal file array");
                    assertEquals(paths.size(),captured.size(),"Captured result must contain exactly the selected two files");
                    var files = new ArrayList<Map<String,String>>();
                    for (int index = 0; index < paths.size(); index++) {
                        var file = captured.get(index);
                        var path = paths.get(index);
                        assertEquals(path,file.path("path").asString(),"Captured file path/order differs from selected files");
                        assertTrue(file.path("before").isString(),"Captured original source must be a string");
                        assertTrue(file.path("content").isString(),"Captured candidate content must be a string");
                        var source = workspace.resolve(path).toRealPath();
                        assertTrue(source.startsWith(workspace),"Captured source must remain inside the new workspace");
                        assertEquals(Files.readString(source),file.path("before").asString(),
                                "Replay must start from the exact captured original source: "+path);
                        files.add(Map.of("path",path,"content",file.path("content").asString()));
                    }
                    var changes = context.getBean(CodeChangeService.class);
                    var snapshot = changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL,conversation,
                            paths.getFirst(),inputs.path("prototypeId").asString(),"",
                            new TaskRef(inputs.path("project").asString(),
                                    UUID.fromString(inputs.path("taskId").asString()),inputs.path("revision").asLong()),
                            paths.subList(1,paths.size()));
                    replayContext.put("generationSnapshotId",snapshot.id());
                    Files.writeString(session.resolve("captured-replay-context.json"),JSON.writeValueAsString(replayContext));
                    proposal = changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL,conversation,snapshot.id(),
                            JSON.writeValueAsString(Map.of("files",files)),true);
                    assertNotEquals(capturedResult.path("proposal").path("id").asString(),proposal.id().toString(),
                            "Replay must create a fresh candidate instead of restoring an old record");
                    assertFalse(proposal.applied(),"Replay must leave explicit application to the browser");
                    replayContext.put("proposalId",proposal.id());
                    Files.writeString(session.resolve("captured-replay-context.json"),JSON.writeValueAsString(replayContext));
                    for (int index = 0; index < paths.size(); index++) {
                        assertEquals(captured.get(index).path("content").asString(),proposal.files().get(index).content(),
                                "Rebinding must preserve the captured candidate content verbatim");
                        assertEquals(captured.get(index).path("before").asString(),
                                Files.readString(workspace.resolve(paths.get(index))),"Rebinding must not apply source changes");
                    }
                } else {
                    Files.writeString(session.resolve("real-model-request.json"),JSON.writeValueAsString(request));
                    // Exactly one production generation request; failures stay observable, no deterministic fallback.
                    var result = app.send(conversation,JSON.writeValueAsString(Map.of("message",
                            "Deliver the approved Chinese task form with multiline description and real AI optimization, preserving preview/adopt/cancel and draft protection.",
                            "toolMode","none","context",request)));
                    Files.writeString(session.resolve("real-model-result.json"),JSON.writeValueAsString(result));
                    assertNotNull(result.proposal(),"Real model did not produce a candidate: "+session);
                    proposal = result.proposal();
                }
                assertEquals(paths, proposal.files().stream().map(file -> file.path()).toList());
                var manifest = session.resolve("host.json");
                Files.writeString(manifest,JSON.writeValueAsString(Map.of("backend",backend,"workspace",workspace.toString(),
                        "task",task,"proposal",proposal,"provider",replay
                                ? "captured real model output; new binding; not new generation"
                                : "real configured model; fresh generation")));
                browser("deliver",manifest);
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }
    private static void browser(String mode, Path input) throws Exception {
        var frontend = Path.of(System.getenv().getOrDefault("EAP_ACCEPTANCE_FRONTEND",
                Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toString()));
        var command = new ProcessBuilder("node","apps/web/__tests__/browser/textarea-source-delivery-live.mjs",mode,input.toString())
                .directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_") || key.equals("SPRING_DATASOURCE_PASSWORD"));
        var process = command.start();
        try {
            assertTrue(process.waitFor(300,TimeUnit.SECONDS),"Browser phase timed out: "+mode+" "+input);
            assertEquals(0,process.exitValue(),"Browser phase failed: "+mode+" "+input);
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
