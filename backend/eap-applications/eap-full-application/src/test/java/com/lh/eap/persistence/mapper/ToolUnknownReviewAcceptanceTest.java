package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.ToolExecution;
import com.lh.eap.local.LocalProcessIdentityInspector;
import java.net.URI;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.core.io.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;

/** Explicit opt-in: self-owned schema, crash host and processes, real HTTP + production Vue panel. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_TOOL_UNKNOWN_REVIEW", matches = "true")
class ToolUnknownReviewAcceptanceTest {
    private static final String ROUTE = "/api/cli-programs/git/operations/git-status/executions";
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final List<Process> hosts = new ArrayList<>();
    private final List<Map<?,?>> identities = new ArrayList<>();
    private Process browser;
    private Path session;
    private String schema;
    private String base;
    private Path repository;
    private boolean realGit;

    @Test void crashedOwnerLeavesLiveChildUntilExplicitOsReviewAndDurableHumanClosure() throws Exception {
        exercise(false);
    }
    @Test @EnabledIfEnvironmentVariable(named = "EAP_RUN_REAL_GIT_UNKNOWN", matches = "true")
    void realGitAbnormalExitWithoutDurableResultRequiresExplicitUnknownReview() throws Exception {
        exercise(true);
    }
    private void exercise(boolean useRealGit) throws Exception {
        realGit = useRealGit;
        assertEquals("true", System.getenv("EAP_RUN_BOARD_PERSISTENCE"), "Approved local persistence gate required");
        assertNotNull(System.getenv("EAP_DB_PASSWORD"));
        assertNotNull(System.getenv("EAP_PLAYWRIGHT_MODULE"));
        assertNotNull(System.getenv("EAP_CHROMIUM"));
        repository = Path.of("").toAbsolutePath();
        while (!Files.isDirectory(repository.resolve("frontend"))) repository = repository.getParent();
        session = repository.resolve("backend/target/tool-unknown-review-" + UUID.randomUUID());
        Files.createDirectories(session.resolve("workspace"));
        schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var applicationDigests = admin.queryForList("SELECT id::text,md5(snapshot::text) AS digest FROM eap.tool_execution ORDER BY id");
        admin.execute("CREATE SCHEMA " + schema);
        try {
            for (int version : List.of(26, 27, 28, 29)) {
                var resources = new org.springframework.core.io.support.PathMatchingResourcePatternResolver()
                        .getResources("classpath:db/migration/V" + version + "__*.sql");
                assertEquals(1, resources.length);
                var sql = resources[0].getContentAsString(StandardCharsets.UTF_8).replace("eap.tool_execution", schema + ".tool_execution");
                try (var connection = ToolUnknownReviewFixture.originalDataSource().getConnection()) {
                    ScriptUtils.executeSqlScript(connection, new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)));
                }
            }
            admin.execute("CREATE TABLE " + schema + ".capability_setting (capability text PRIMARY KEY, enabled boolean NOT NULL, notes text, updated_at timestamptz)");
            var init = new ProcessBuilder("git", "init", "--quiet").directory(session.resolve("workspace").toFile()).start();
            assertTrue(init.waitFor(5, TimeUnit.SECONDS)); assertEquals(0, init.exitValue());
            if (realGit) {
                // More than a pipe buffer of real status output holds Git alive while the start callback is gated.
                for (int i = 0; i < 2000; i++) Files.writeString(session.resolve("workspace/file-" + i + "-" + "x".repeat(80) + ".txt"), "owned test file\n");
            }

            startHost(true);
            var requestId = UUID.randomUUID();
            var started = request("POST", ROUTE, Map.of("requestId", requestId), 202);
            var id = (String) started.get("id");
            awaitFile(realGit ? "git-started.json" : "captured.json");
            var jdbc = new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
            var store = new JdbcToolExecutionStore(jdbc);
            var beforeCrash = store.find(UUID.fromString(id)).orElseThrow();
            assertEquals("RUNNING", beforeCrash.status());
            var evidence = (realGit ? beforeCrash.steps().getLast() : beforeCrash.steps().getFirst()).evidence();
            identities.add(evidence);
            for (var child : (List<?>) evidence.get("processDescendants")) identities.add((Map<?,?>) child);
            long childPid = -1;
            Map<?,?> javaChild = null;
            if (realGit) {
                assertEquals(List.of("root", "filters", "status"), beforeCrash.steps().stream().map(ToolExecution.Step::phase).toList());
                assertOwnedAlive(evidence);
                var command = beforeCrash.steps().getLast().command();
                assertTrue(command.contains("status"));
                assertEquals(command, ToolUnknownReviewFixture.JSON.readValue(read("git-started.json"), Map.class).get("command"));
                var parent = ProcessHandle.of(pid(evidence)).orElseThrow();
                // External test-only OS audit of this known process tree; never inject it into product evidence.
                try (var children = parent.descendants()) { children.forEach(handle -> {
                    var info = handle.info();
                    identities.add(Map.of("processPid", handle.pid(), "processStartedAt", info.startInstant().orElseThrow().toString(),
                            "processExecutable", info.command().orElseThrow()));
                }); }
                var gitProcesses = identities.stream().filter(ToolUnknownReviewAcceptanceTest::isGit).toList();
                assertFalse(gitProcesses.isEmpty());
                write("owned-git-processes.json", identities);
                stopOwned(gitProcesses.getLast());
                for (var identity : identities.reversed()) stopOwned(identity);
                write("git-resume.request", Map.of("verifiedAbnormalTermination", true));
                awaitFile("git-exited.json");
                var exited = ToolUnknownReviewFixture.JSON.readValue(read("git-exited.json"), Map.class);
                assertEquals(false, exited.get("success")); assertNotEquals(0, ((Number) exited.get("exitCode")).intValue());
                var metadata = (Map<?,?>) exited.get("metadata");
                assertEquals(true, metadata.get("processExited")); assertEquals(true, metadata.get("processTreeCleanup"));
                assertEquals(beforeCrash, store.find(UUID.fromString(id)).orElseThrow(), "Actual failure has not been committed by workflow");
            } else {
                var childInfo = ToolUnknownReviewFixture.JSON.readValue(read("child-ready.json"), Map.class);
                childPid = ((Number) childInfo.get("pid")).longValue();
                long expectedPid = childPid;
                javaChild = identities.stream().filter(value -> pid(value) == expectedPid).findFirst().orElseThrow();
                assertOwnedAlive(identities.getFirst()); assertOwnedAlive(javaChild);
            }
            stopHost(hosts.getLast(), true);
            if (!realGit) { assertOwnedAlive(identities.getFirst()); assertOwnedAlive(javaChild); }

            startHost(false);
            var unknown = request("GET", ROUTE + "/" + id, null, 200);
            assertEquals("UNKNOWN", unknown.get("status"));
            assertEquals("SERVICE_RESTART_EXIT_UNCONFIRMED", unknown.get("unconfirmedReason"));
            assertEquals(beforeCrash.steps(), store.find(UUID.fromString(id)).orElseThrow().steps());
            request("POST", ROUTE, Map.of("requestId", UUID.randomUUID()), 409);
            var beforeInspection = store.find(UUID.fromString(id)).orElseThrow();
            request("GET", ROUTE + "/" + id + "/process-review", null, 200);
            assertEquals(beforeInspection, store.find(UUID.fromString(id)).orElseThrow());
            write("browser-input.json", Map.of("base", base, "executionId", id, "requestId", requestId,
                    "session", session.toString(), "frontend", repository.resolve("frontend").toString(), "childPid", childPid, "realGit", realGit));
            browser = new ProcessBuilder("node", repository.resolve("frontend/apps/web/__tests__/browser/tool-unknown-review-live.mjs").toString(),
                    "--session", session.toString()).directory(repository.resolve("frontend").toFile())
                    .redirectErrorStream(true).redirectOutput(session.resolve("browser.log").toFile()).start();

            if (!realGit) {
                awaitFile("stop-parent.request");
                stopOwned(identities.getFirst());
                assertOwnedAlive(javaChild);
                write("parent-stopped.json", Map.of("verified", true));
            }
            awaitFile(realGit ? "verify-git-stopped.request" : "stop-child.request");
            for (var identity : identities.reversed()) stopOwned(identity);
            for (var identity : identities) assertFalse(ProcessHandle.of(pid(identity)).map(ProcessHandle::isAlive).orElse(false));
            write("tree-stopped.json", Map.of("verified", true));
            assertTrue(browser.waitFor(60, TimeUnit.SECONDS), "Browser did not finish");
            assertEquals(0, browser.exitValue(), () -> read("browser.log"));
            browser = null;
            var closed = store.find(UUID.fromString(id)).orElseThrow();
            assertEquals("CLOSED_UNKNOWN", closed.status());
            assertEquals(beforeInspection.steps(), closed.steps());
            assertEquals(beforeInspection.stdout(), closed.stdout()); assertEquals(beforeInspection.stderr(), closed.stderr());
            assertEquals(beforeInspection.exitCode(), closed.exitCode()); assertEquals(beforeInspection.exitEvidence(), closed.exitEvidence());
            assertEquals(beforeInspection.finishedAt(), closed.finishedAt()); assertEquals(beforeInspection.cancelRequested(), closed.cancelRequested());
            assertEquals(beforeInspection.unconfirmedReason(), closed.unconfirmedReason());
            assertEquals("local-operator", closed.resolution().operator());
            assertTrue(closed.resolution().processTreeStopped());
            assertEquals(ToolUnknownReviewFixture.JSON.readValue(ToolUnknownReviewFixture.JSON.writeValueAsString(closed), Map.class),
                    request("GET", ROUTE + "/" + id, null, 200), "Independent JDBC snapshot matches the actual HTTP closure");
            if (realGit) {
                var index = session.resolve("workspace/.git/index");
                assertFalse(Files.exists(index), "Owned untracked-only repository must have no index to restore");
                Map<String,Object> failed;
                try {
                    Files.writeString(index, "invalid-owned-test-index");
                    failed = settle(request("POST", ROUTE, Map.of("requestId", UUID.randomUUID()), 202));
                    assertEquals("FAILED", failed.get("status"));
                    assertNotEquals(0, ((Number) failed.get("exitCode")).intValue());
                    assertNotNull(failed.get("exitEvidence")); assertNull(failed.get("unconfirmedReason"));
                    write("confirmed-git-failure.json", failed);
                } finally { Files.deleteIfExists(index); }
                var repaired = settle(request("POST", ROUTE, Map.of("requestId", UUID.randomUUID()), 202));
                assertEquals("SUCCEEDED", repaired.get("status"));
                write("git-repaired.json", Map.of("id", repaired.get("id"), "status", repaired.get("status")));
            }

            stopHost(hosts.getLast(), false);
            startHost(false);
            assertEquals(closed, store.find(closed.id()).orElseThrow());
            request("POST", ROUTE, Map.of("requestId", requestId), 202);
            assertEquals(closed, store.find(closed.id()).orElseThrow());
            write("result.json", Map.of("passed", true, "executionId", id, "schema", schema,
                    "restartPreservedClosedUnknown", true, "ownedProcessTreeStopped", true,
                    "realGitAbnormalExit", realGit,
                    "browser", ToolUnknownReviewFixture.JSON.readValue(read("browser-result.json"), Map.class)));
        } finally {
            if (browser != null && browser.isAlive()) browser.destroyForcibly().waitFor(5, TimeUnit.SECONDS);
            for (var host : hosts) if (host.isAlive()) stopHost(host, false);
            for (var identity : identities.reversed()) stopOwned(identity);
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA " + schema + " CASCADE");
            assertEquals(applicationDigests, admin.queryForList("SELECT id::text,md5(snapshot::text) AS digest FROM eap.tool_execution ORDER BY id"),
                    "The controlled fixture must not modify application execution records");
            write("cleanup.json", Map.of("ownedSchemaDropped", true, "hostsStopped", hosts.stream().noneMatch(Process::isAlive),
                    "applicationRecordsUnchanged", true,
                    "ownedProcessesStopped", identities.stream().noneMatch(value -> ProcessHandle.of(pid(value)).map(ProcessHandle::isAlive).orElse(false))));
        }
    }

    private void startHost(boolean fault) throws Exception {
        Files.deleteIfExists(session.resolve("host.json"));
        var java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
        var host = new ProcessBuilder(java, "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-cp",
                System.getProperty("surefire.test.class.path", System.getProperty("java.class.path")),
                ToolUnknownReviewFixture.class.getName(), session.toString(), schema, fault && realGit ? "real-git" : Boolean.toString(fault))
                .redirectErrorStream(true).redirectOutput(session.resolve("host-" + hosts.size() + ".log").toFile()).start();
        hosts.add(host); awaitFile("host.json");
        var info = ToolUnknownReviewFixture.JSON.readValue(read("host.json"), Map.class);
        assertEquals(host.pid(), ((Number) info.get("pid")).longValue());
        base = "http://127.0.0.1:" + info.get("port");
    }
    private void stopHost(Process host, boolean force) throws Exception {
        if (force) host.destroyForcibly(); else host.destroy();
        if (!host.waitFor(15, TimeUnit.SECONDS)) { host.destroyForcibly(); assertTrue(host.waitFor(5, TimeUnit.SECONDS)); }
    }
    private static long pid(Map<?,?> identity) { return ((Number) identity.get("processPid")).longValue(); }
    private static boolean isGit(Map<?,?> identity) {
        var name = Path.of(String.valueOf(identity.get("processExecutable"))).getFileName().toString().toLowerCase(Locale.ROOT);
        return name.equals("git") || name.equals("git.exe");
    }
    private Map<String,Object> settle(Map<String,Object> row) throws Exception {
        long deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos();
        while (List.of("CREATED", "RUNNING", "CANCELLING").contains(row.get("status")) && System.nanoTime() < deadline) {
            Thread.sleep(20); row = request("GET", ROUTE + "/" + row.get("id"), null, 200);
        }
        assertFalse(List.of("CREATED", "RUNNING", "CANCELLING").contains(row.get("status")), "Git did not settle");
        return row;
    }
    private static void assertOwnedAlive(Map<?,?> identity) {
        assertEquals("MATCHING_ALIVE", new LocalProcessIdentityInspector().inspect(pid(identity),
                (String) identity.get("processStartedAt"), (String) identity.get("processExecutable")).status());
    }
    private static void stopOwned(Map<?,?> identity) throws Exception {
        var handle = ProcessHandle.of(pid(identity));
        if (handle.isEmpty() || !handle.get().isAlive()) return;
        assertOwnedAlive(identity); handle.get().destroyForcibly(); handle.get().onExit().get(5, TimeUnit.SECONDS);
    }
    private void awaitFile(String name) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(40);
        while (!Files.exists(session.resolve(name)) && System.nanoTime() < deadline) {
            if (name.equals("host.json") && !hosts.getLast().isAlive())
                fail("Fixture host exited: " + read("host-" + (hosts.size() - 1) + ".log"));
            if (browser != null && !browser.isAlive()) fail("Browser exited: " + read("browser.log"));
            Thread.sleep(50);
        }
        assertTrue(Files.exists(session.resolve(name)), "Missing fixture handshake " + name);
    }
    @SuppressWarnings("unchecked")
    private Map<String,Object> request(String method, String path, Object body, int code) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(10))
                .header("Content-Type", "application/json").method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                        : HttpRequest.BodyPublishers.ofString(ToolUnknownReviewFixture.JSON.writeValueAsString(body))).build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(code, response.statusCode(), response.body());
        return ToolUnknownReviewFixture.JSON.readValue(response.body(), Map.class);
    }
    private void write(String name, Object value) throws Exception {
        Files.writeString(session.resolve(name), ToolUnknownReviewFixture.JSON.writeValueAsString(value));
    }
    private String read(String name) {
        try { return Files.readString(session.resolve(name)); } catch (Exception missing) { return ""; }
    }
}
