package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.EapApplication;
import com.lh.eap.api.TaskRef;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.ComponentGraph;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class RouteResourceDeliveryTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String ENTRY = "frontend/src/routePages.ts";
    private static final String PAGE = "frontend/src/DetailPage.vue";
    private static final String CSS = "frontend/src/detail.css";
    private static final String DATA = "frontend/src/copy.json";

    @Test void literalLazyTargetsRemainBoundedAndShareTheWholeDependencyGraph() {
        String page = "<script setup>\nimport './detail.css'\nimport copy from './copy.json'\n</script>";
        String entry = "export const detail = () => import('./DetailPage.vue')\n";
        var graph = ComponentGraph.validate(ENTRY, files(entry, page, ".detail {color: red}", "{}"));
        assertEquals(com.lh.eap.delivery.SourceDependencyKind.LAZY_MODULE, graph.getFirst().kind());
        assertEquals(PAGE, graph.getFirst().to());
        for (String value : List.of("import(path)", "import(" + (char)96 + "./DetailPage.vue" + (char)96 + ")",
                "import('./' + 'DetailPage.vue')", "import('./DetailPage.vue', {with:{type:'json'}})",
                "require('./DetailPage.vue')", "import.meta.glob('./*.vue')", "import('./detail.css')",
                "import('./copy.json')", "import('./DetailPage')", "import('./DetailPage.vue?raw')")) {
            assertGraphError("CODE_GRAPH_DYNAMIC_IMPORT_DENIED", "export const load=()=>"+value, page, "", "{}");
        }
        assertGraphError("CODE_GRAPH_IMPORT_DENIED", "const load=()=>import('https://host.test/DetailPage.vue')", page, "", "{}");
        assertGraphError("CODE_GRAPH_UNDECLARED_IMPORT", entry.replace("DetailPage", "Missing"), page, "", "{}");
        assertGraphError("CODE_GRAPH_CYCLE", entry, page + "\n<script>import {detail} from './routePages'</script>", "", "{}");
        assertGraphError("CODE_GRAPH_DISCONNECTED", "const example = \"import('./DetailPage.vue')\";", page, "", "{}");
        assertGraphError("CODE_GRAPH_DISCONNECTED", "// import('./DetailPage.vue')\nexport const x=1;", page, "", "{}");
        assertGraphError("CODE_GRAPH_IMPORT_DENIED", entry.replace("DetailPage", "Detail/*comment*/Page"), page, "", "{}");
        assertEquals(3, ComponentGraph.validate(ENTRY, files(
                "export const detail=()=>import( /* target */ './DetailPage.vue' /* selected */ )",
                page, "", "{}")).size());
    }

    @Test void graphRejectsMissingResourcesUnsafeReferencesAndInvalidData() {
        String entry = "export { default as Detail } from './DetailPage.vue'\n";
        String page = "<script setup lang=\"ts\">\nimport './detail.css'\nimport copy from './copy.json'\n</script>";
        assertEquals(3, ComponentGraph.validate(ENTRY, files(entry, page, ".detail {color: red}", "{}")).size());
        assertGraphError("CODE_GRAPH_UNDECLARED_IMPORT", entry, page, "@import './missing.css';", "{}");
        assertGraphError("CODE_GRAPH_UNDECLARED_IMPORT", entry, page.replace("./copy.json", "./other.json"), "", "{}");
        assertGraphError("CODE_GRAPH_RESOURCE_DENIED", entry, page, "@import 'https://example.test/style.css';", "{}");
        assertGraphError("CODE_GRAPH_RESOURCE_DENIED", entry, page, ".detail {background: url(https://example.test/x)}", "{}");
        assertGraphError("CODE_GRAPH_RESOURCE_DENIED", entry, page, ".detail {color: red}", "{} {}");
        assertGraphError("CODE_GRAPH_RESOURCE_DENIED", entry, page + "<style src=\"./detail.css\" />", "", "{}");
        assertGraphError("CODE_GRAPH_CYCLE", entry, page, "@import './detail.css';", "{}");
        assertGraphError("CODE_GRAPH_DISCONNECTED", entry, page.replace("import copy from './copy.json'", ""), "", "{}");
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "EAP_ROUTE_RESOURCE_CHROMIUM", matches = "true")
    void appliesAndVerifiesAnActualTwoRouteDeliveryThroughTheBoard() throws Exception {
        boolean interactiveDesign = "true".equals(System.getenv("EAP_ROUTE_INTERACTIVE_DESIGN"));
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(),
                interactiveDesign ? "interactive-design-" : "route-resource-");
        boolean realModel = "true".equals(System.getenv("EAP_ROUTE_REAL_MODEL"));
        String capturedResult = System.getenv("EAP_ROUTE_CAPTURED_RESULT");
        assertFalse(realModel && capturedResult != null, "Choose a fresh model call or explicit captured output, never both");
        String connectionStore = System.getenv("EAP_ROUTE_CONNECTION_STORE");
        if (realModel) {
            assertNotNull(connectionStore, "Real model validation requires explicit EAP_ROUTE_CONNECTION_STORE");
            try (var stream = Files.newInputStream(Path.of(connectionStore))) {
                assertTrue(stream.read() >= 0, "Explicit connection store is empty");
            }
        }
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        runBrowser("prepare", workspace);
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(ToolUnknownReviewFixture.scopedDataSource(schema), workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext) app).registerBean(
                            SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.runtime.authorized-root=" + workspace,
                            "--eap.ai.connection-store=" + (realModel
                                    ? Path.of(connectionStore).toAbsolutePath()
                                    : session.resolve("connections.json")),
                            "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5192")) {
                var backend = "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port");
                var setup = session.resolve("setup.json");
                Files.writeString(setup, JSON.writeValueAsString(Map.of("backend", backend)));
                runBrowser("setup", setup);
                var inputs = JSON.readTree(Files.readString(session.resolve("inputs.json")));
                var interactionInstructions = interactiveDesign ? inputs.path("interactionInstructions").asString("") : "";
                if (interactiveDesign) assertFalse(interactionInstructions.isBlank(), "Interactive design requires explicit behavioral criteria");
                var changes = context.getBean(CodeChangeService.class);
                var task = new TaskRef(inputs.path("project").asString(),
                        UUID.fromString(inputs.path("taskId").asString()), inputs.path("revision").asLong());
                var paths = new ArrayList<String>();
                for (var file : inputs.path("answer").path("files")) paths.add(file.path("path").asString());
                assertEquals(ENTRY, paths.getFirst());
                UUID conversation = UUID.randomUUID();
                var version = inputs.path("prototypeId").asString();
                CodeChangeService.Proposal proposal;
                var data = workspace.resolve(DATA);
                var baseline = Files.readString(data);
                if (capturedResult != null) {
                    var result = JSON.readTree(Files.readString(Path.of(capturedResult)));
                    assertEquals(paths.size(), result.path("proposal").path("files").size());
                    var answerFiles = new ArrayList<Map<String,String>>();
                    for (var file : result.path("proposal").path("files"))
                        answerFiles.add(Map.of("path", file.path("path").asString(), "content", file.path("content").asString()));
                    var snapshot = changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL, conversation, ENTRY,
                            version, "", task, paths.subList(1, paths.size()));
                    proposal = changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL, conversation, snapshot.id(),
                            JSON.writeValueAsString(Map.of("files", answerFiles)), true);
                    Files.copy(Path.of(capturedResult), session.resolve("captured-model-result.json"));
                } else if (!realModel) {
                var snapshot = changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL, conversation, ENTRY,
                        version, "", task, paths.subList(1, paths.size()));
                assertNotNull(snapshot.taskSnapshot().prototype());
                Files.writeString(data, "{\"title\":\"changed during generation\"}");
                var answer = inputs.path("answer").toString();
                assertEquals("CODE_GENERATION_BASELINE_CHANGED", assertThrows(ResponseStatusException.class,
                        () -> changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL, conversation, snapshot.id(), answer, true)).getReason());
                Files.writeString(data, baseline);
                proposal = changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL, conversation, snapshot.id(), answer, true);
                } else {
                    // Exactly one real call through the production context/snapshot/proposal path.
                    // No deterministic generation or candidate is created in this branch.
                    var app = context.getBean(com.lh.eap.ai.AiChatApplication.class);
                    var realConversation = app.open("{}").conversationId();
                    var request = new LinkedHashMap<String,Object>();
                    request.put("mode", "code"); request.put("expert", "frontend");
                    request.put("approval", "review"); request.put("reasoning", "low");
                    request.put("files", List.of(Map.of("name", "read-only-host/frontend/src/main.ts",
                            "content", Files.readString(workspace.resolve("frontend/src/main.ts")))));
                    request.put("prototypeVersionId", version);
                    request.put("targetPath", ENTRY); request.put("componentPaths", paths.subList(1,paths.size()));
                    request.put("taskRef", Map.of("projectId",task.projectId(),"taskId",task.taskId(),"revision",task.revision()));
                    request.put("instructions", "Implement the selected route/page/style/JSON files only. Keep imports on separate single lines. "
                            + "The referenced read-only host uses hash navigation: overview is #/ and detail is #/detail. "
                            + "All links to these pages, including links in overview and error components, must preserve that routing contract. "
                            + "Do not modify the host. No history-mode /detail or /overview links. "
                            + "routePages.ts exports pages.overview and pages.detail. Overview statically imports OverviewPage.vue. "
                            + "Detail uses Vue defineAsyncComponent with loader () => import('./DetailPage.vue'), delay:0, loadingComponent showing role=status text Loading detail…, "
                            + "errorComponent showing role=alert text Detail could not load. Return to overview or reload. "
                            + "OverviewPage heading is Delivery overview and contains a paragraph describing overview. "
                            + "DetailPage imports copy.json and detail.css and renders article.detail with h1 copy.title and paragraph copy.description. "
                            + "copy.json has title Delivery detail and description Bound source and verification evidence. "
                            + "detail.css imports './palette.css' using a standalone quoted @import line then .detail { color:var(--review-ink); padding:16px; }. "
                            + "palette.css defines :root { --review-ink:rgb(24,72,96); }. No other files, dependencies, APIs, network calls, timers or script side effects. "
                            + "Preserve all existing functional contracts. Return complete source for the exact six selected paths in order. "
                            + interactionInstructions);
                    Files.writeString(session.resolve("real-model-request.json"), JSON.writeValueAsString(request));
                    var result = app.send(realConversation, JSON.writeValueAsString(Map.of("message",
                            "Deliver the saved overview/detail design as a working two-route page, preserving loading/failure states and local CSS/JSON dependencies.",
                            "toolMode","none","context",request)));
                    Files.writeString(session.resolve("real-model-result.json"), JSON.writeValueAsString(result));
                    assertNotNull(result.proposal(), "Real model did not return an accepted candidate; inspect bounded result: "+session);
                    proposal = result.proposal();
                }
                assertEquals(baseline, Files.readString(data));
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JSON.writeValueAsString(Map.of(
                        "backend", backend, "workspace", workspace.toString(), "task", task, "proposal", proposal,
                        "provider", realModel ? "real configured model" : capturedResult != null
                                ? "explicit captured real model output; new snapshot and task binding" : "deterministic candidate")));
                runBrowser("deliver", manifest);
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "EAP_DEPENDENCY_PREPARATION", matches = "true")
    void readsDependenciesInActualPreparationDialogWithoutGeneratingOrWriting() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "dependency-preparation-");
        var workspace = Files.createDirectory(session.resolve("workspace")).toRealPath();
        var frontend = Files.createDirectory(workspace.resolve("frontend"));
        Files.writeString(frontend.resolve("Page.vue"), "<script setup>import './style.css'; const detail = () => import('./Detail.vue')</script>");
        Files.writeString(frontend.resolve("Detail.vue"), "<script setup>import copy from './copy.json'</script>");
        Files.writeString(frontend.resolve("style.css"), "p { color:red }");
        Files.writeString(frontend.resolve("copy.json"), "{\"title\":\"Detail\"}");
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var overrides = new SourceWriteReviewPersistenceTest.Overrides(ToolUnknownReviewFixture.scopedDataSource(schema), workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext) app).registerBean(
                            SourceWriteReviewPersistenceTest.Overrides.class, () -> overrides))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.devtools.restart.enabled=false", "--spring.main.banner-mode=off",
                            "--eap.runtime.authorized-root=" + workspace,
                            "--eap.ai.connection-store=" + session.resolve("connections.json"),
                            "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5192")) {
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, JSON.writeValueAsString(Map.of("backend",
                        "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port"))));
                runBrowser("dependencies", manifest);
                assertEquals("{\"title\":\"Detail\"}", Files.readString(frontend.resolve("copy.json")));
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private static List<CodeChangeService.Change> files(String entry, String page, String css, String data) {
        return List.of(new CodeChangeService.Change(ENTRY, null, entry, "absent"),
                new CodeChangeService.Change(PAGE, null, page, "absent"),
                new CodeChangeService.Change(CSS, null, css, "absent"),
                new CodeChangeService.Change(DATA, null, data, "absent"));
    }

    private static void assertGraphError(String code, String entry, String page, String css, String data) {
        assertEquals(code, assertThrows(ResponseStatusException.class,
                () -> ComponentGraph.validate(ENTRY, files(entry, page, css, data))).getReason());
    }

    private static void runBrowser(String mode, Path input) throws Exception {
        var frontend = Path.of(System.getenv().getOrDefault("EAP_ACCEPTANCE_FRONTEND",
                Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toString()));
        var command = new ProcessBuilder("vp", "node", "apps/web/__tests__/browser/route-resource-delivery-live.mjs", mode, input.toString())
                .directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_"));
        var process = command.start();
        try {
            assertTrue(process.waitFor(240, TimeUnit.SECONDS), "Route/resource test timed out: " + input);
            assertEquals(0, process.exitValue(), "Route/resource test failed: " + input);
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }
}
