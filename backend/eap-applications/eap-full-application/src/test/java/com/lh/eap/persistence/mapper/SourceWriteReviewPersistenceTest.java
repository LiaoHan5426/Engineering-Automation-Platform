package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.EapApplication;
import com.lh.eap.api.TaskRef;
import com.lh.eap.application.service.BoardApplicationCatalog;
import com.lh.eap.application.service.BoardRuntimeService;
import com.lh.eap.application.service.BoardTaskService;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Interrupted durable claim and partial filesystem effect in an isolated full-application host. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_SINGLE_CONTRACTS", matches = "true")
class SourceWriteReviewPersistenceTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String OPERATOR = RuntimeWorkspace.OPERATOR_LABEL;
    private static final String PAGE = "frontend/Page.vue";
    private static final String CHILD = "frontend/Summary.vue";
    private static final String PAGE_CANDIDATE =
            "<script setup>\nimport Summary from './Summary.vue'\n</script><template><Summary /></template>\n";
    private static final String CHILD_BASE = "<template><span>Before</span></template>\n";
    private static final String CHILD_CANDIDATE = "<template><span>Candidate</span></template>\n";

    @Test
    void closesInterruptedWriteWithoutCreatingDeliveryEvidenceAndResumesFromCurrentFiles() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "source-write-review-");
        var schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            // Exercise an existing V35 APPLYING record through migration and full-app startup recovery.
            CurrentContractTestSchema.migrate(session, schema, "35");
            var source = ToolUnknownReviewFixture.scopedDataSource(schema);
            var jdbc = new JdbcTemplate(source);
            var manager = new DataSourceTransactionManager(source);
            var root = Files.createDirectory(session.resolve("workspace")).toRealPath();
            Files.createDirectory(root.resolve("frontend"));
            Files.writeString(root.resolve(PAGE), "<template><p>Before</p></template>\n");
            Files.writeString(root.resolve(CHILD), CHILD_BASE);
            var runtime = new RuntimeWorkspace(root, root.toString());
            var store = new JdbcCodeProposalStore(jdbc, manager);
            var changes = new CodeChangeService(runtime, null, ignored -> "", new JdbcCodeGenerationStore(jdbc, manager), store);
            var project = "source-write-review";
            var task = new BoardTaskService(jdbc).create(new BoardTaskService.Draft(project, "Resume interrupted source write",
                    "", "ready", "Recover safely", "Preserve ambiguity and file evidence", UUID.randomUUID()));
            var binding = new TaskRef(project, task.id(), task.revision());
            var conversation = UUID.randomUUID();
            var initial = changes.prepareGeneration(OPERATOR, conversation, PAGE, "", "", binding, List.of(CHILD));
            var proposal = changes.proposePrepared(OPERATOR, conversation, initial.id(), answer(CHILD_CANDIDATE), true);
            assertTrue(store.claim(OPERATOR, conversation, proposal.id()));
            Files.writeString(root.resolve(PAGE), PAGE_CANDIDATE);

            CurrentContractTestSchema.migrate(session, schema, "36");
            var overrides = new Overrides(source, root);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(application -> ((GenericApplicationContext) application).registerBean(Overrides.class, () -> overrides))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false",
                            "--spring.main.banner-mode=off", "--spring.devtools.restart.enabled=false",
                            "--eap.ai.connection-store=" + session.resolve("connections.json"),
                            "--eap.ai.artifact-root=" + session.resolve("artifacts"),
                            "--eap.web.allowed-origins=http://127.0.0.1:5191")) {
                var review = context.getBean(SourceWriteReview.class);
                var liveChanges = context.getBean(CodeChangeService.class);
                var board = context.getBean(BoardRuntimeService.class);
                var unknown = store.find(OPERATOR, conversation, proposal.id()).orElseThrow();
                assertEquals("UNKNOWN", unknown.status());
                assertEquals("CODE_APPLICATION_INTERRUPTED", unknown.reason());
                assertEquals(1, board.inspect(project).unknownWriteCount());
                assertEquals("CODE_WORKSPACE_BUSY", assertThrows(ResponseStatusException.class,
                        () -> liveChanges.prepareGeneration(OPERATOR, conversation, PAGE, "", "", binding, List.of(CHILD))).getReason());
                assertEquals(404, assertThrows(ResponseStatusException.class, () -> review.inspect(UUID.randomUUID())).getStatusCode().value());
                var other = Files.createDirectory(session.resolve("other")).toRealPath();
                assertEquals(404, assertThrows(ResponseStatusException.class,
                        () -> new SourceWriteReview(new RuntimeWorkspace(other, other.toString()), changes, store).inspect(proposal.id()))
                        .getStatusCode().value());

                var snapshot = review.inspect(proposal.id()).observation();
                assertEquals(List.of(SourceWriteReview.FileMatch.CANDIDATE, SourceWriteReview.FileMatch.BASELINE),
                        snapshot.files().stream().map(SourceWriteReview.FileEvidence::match).toList());
                var requestId = UUID.randomUUID();
                assertEquals("INVALID_CODE_REVIEW", assertThrows(ResponseStatusException.class,
                        () -> review.close(proposal.id(), new SourceWriteReview.Close(requestId, snapshot.digest(), "checked", false))).getReason());

                // A non-regular target cannot be interpreted as missing or released by the review.
                var child = root.resolve(CHILD);
                var backup = root.resolve("child-fixture.txt");
                Files.move(child, backup);
                Files.createDirectory(child);
                assertEquals("CODE_REVIEW_UNAVAILABLE", assertThrows(ResponseStatusException.class,
                        () -> review.close(proposal.id(), new SourceWriteReview.Close(requestId, snapshot.digest(), "checked", true))).getReason());
                Files.delete(child);
                Files.move(backup, child);

                if (Boolean.parseBoolean(System.getenv("EAP_SOURCE_REVIEW_CHROMIUM"))) {
                    runBrowser(session, context.getEnvironment().getProperty("local.server.port"), proposal.id(), root, project, task.title());
                } else {
                    Files.writeString(child, "<template><span>External edit</span></template>\n");
                    assertEquals("CODE_REVIEW_CHANGED", assertThrows(ResponseStatusException.class,
                            () -> review.close(proposal.id(), new SourceWriteReview.Close(requestId, snapshot.digest(), "checked", true))).getReason());
                    var fresh = review.inspect(proposal.id()).observation();
                    review.close(proposal.id(), new SourceWriteReview.Close(requestId, fresh.digest(), "checked", true));
                }
                var saved = review.inspect(proposal.id());
                assertEquals("CLOSED_UNKNOWN", saved.item().status());
                assertEquals(unknown.reason(), saved.item().reason());
                assertEquals(unknown.startedAt(), saved.item().startedAt());
                assertEquals(0, board.inspect(project).unknownWriteCount());
                var original = store.find(OPERATOR, conversation, proposal.id()).orElseThrow();
                assertEquals(unknown.finishedAt(), original.finishedAt());
                assertNull(original.result());
                assertEquals("CODE_APPLICATION_CLOSED_UNKNOWN", assertThrows(ResponseStatusException.class,
                        () -> liveChanges.apply(OPERATOR, conversation, proposal.id(), true)).getReason());
                assertEquals(PAGE_CANDIDATE, Files.readString(root.resolve(PAGE)));
                assertEquals("<template><span>External edit</span></template>\n", Files.readString(child));
                var audit = saved.resolution();
                assertEquals(OPERATOR, audit.operator());
                assertEquals(saved, review.close(proposal.id(), new SourceWriteReview.Close(
                        audit.requestId(), audit.observation().digest(), audit.note(), true)));
                assertEquals("CODE_REVIEW_CONFLICT", assertThrows(ResponseStatusException.class,
                        () -> review.close(proposal.id(), new SourceWriteReview.Close(
                                audit.requestId(), audit.observation().digest(), "replacement", true))).getReason());
                assertThrows(DataAccessException.class, () -> jdbc.update("UPDATE eap.code_proposal SET reason='changed' WHERE id=?", proposal.id()));
                var catalog = new BoardApplicationCatalog(jdbc);
                assertTrue(catalog.list(binding, root.toString()).items().isEmpty());

                var fresh = liveChanges.prepareGeneration(OPERATOR, conversation, PAGE, "", "", binding, List.of(CHILD));
                assertEquals(Files.readString(child), fresh.companionSources().getFirst().content());
                var next = liveChanges.proposePrepared(OPERATOR, conversation, fresh.id(), answer("<template><p>New delivery</p></template>\n"), true);
                liveChanges.apply(OPERATOR, conversation, next.id(), true);
                assertEquals(List.of(next.id()), catalog.list(binding, root.toString()).items().stream()
                        .map(BoardApplicationCatalog.Item::proposalId).toList());
                assertEquals(saved, review.inspect(proposal.id()));
            }
        } finally {
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private static String answer(String child) {
        return JSON.writeValueAsString(Map.of("files", List.of(
                Map.of("path", PAGE, "content", PAGE_CANDIDATE), Map.of("path", CHILD, "content", child))));
    }

    private static void runBrowser(Path session, String port, UUID id, Path workspace, String project, String title) throws Exception {
        var frontend = Path.of("../../..").toAbsolutePath().normalize().resolve("frontend");
        var manifest = session.resolve("host.json");
        Files.writeString(manifest, JSON.writeValueAsString(Map.of(
                "port", port, "id", id, "workspace", workspace.toString(), "project", project, "title", title)));
        var command = new ProcessBuilder("node", "apps/web/__tests__/browser/source-write-review-live.mjs", manifest.toString())
                .directory(frontend.toFile()).inheritIO();
        command.environment().keySet().removeIf(key -> key.startsWith("EAP_DB_"));
        var process = command.start();
        try {
            assertTrue(process.waitFor(180, TimeUnit.SECONDS), "Chromium scenario timed out: " + session);
            assertEquals(0, process.exitValue(), "Chromium scenario failed: " + session);
        } finally {
            if (process.isAlive()) {
                process.descendants().forEach(ProcessHandle::destroyForcibly);
                process.destroyForcibly();
            }
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class Overrides {
        private final DataSource source;
        private final Path root;
        Overrides(DataSource source, Path root) { this.source = source; this.root = root; }
        @Bean @Primary DataSource sourceReviewDataSource() { return source; }
        @Bean @Primary Path sourceReviewWorkspace() { return root; }
    }
}
