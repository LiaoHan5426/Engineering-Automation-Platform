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

    @Test void crashedOwnerLeavesLiveChildUntilExplicitOsReviewAndDurableHumanClosure() throws Exception {
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

            startHost(true);
            var requestId = UUID.randomUUID();
            var started = request("POST", ROUTE, Map.of("requestId", requestId), 202);
            var id = (String) started.get("id");
            awaitFile("captured.json");
            var jdbc = new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
            var store = new JdbcToolExecutionStore(jdbc);
            var beforeCrash = store.find(UUID.fromString(id)).orElseThrow();
            assertEquals("RUNNING", beforeCrash.status());
            var evidence = beforeCrash.steps().getFirst().evidence();
            identities.add(evidence);
            for (var child : (List<?>) evidence.get("processDescendants")) identities.add((Map<?,?>) child);
            var childInfo = ToolUnknownReviewFixture.JSON.readValue(read("child-ready.json"), Map.class);
            long childPid = ((Number) childInfo.get("pid")).longValue();
            var javaChild = identities.stream().filter(value -> pid(value) == childPid).findFirst().orElseThrow();
            assertOwnedAlive(identities.getFirst()); assertOwnedAlive(javaChild);
            stopHost(hosts.getLast(), true);
            assertOwnedAlive(identities.getFirst()); assertOwnedAlive(javaChild);

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
                    "session", session.toString(), "frontend", repository.resolve("frontend").toString(), "childPid", childPid));
            browser = new ProcessBuilder("node", repository.resolve("frontend/apps/web/__tests__/browser/tool-unknown-review-live.mjs").toString(),
                    "--session", session.toString()).directory(repository.resolve("frontend").toFile())
                    .redirectErrorStream(true).redirectOutput(session.resolve("browser.log").toFile()).start();

            awaitFile("stop-parent.request");
            stopOwned(identities.getFirst());
            assertOwnedAlive(javaChild);
            write("parent-stopped.json", Map.of("verified", true));
            awaitFile("stop-child.request");
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

            stopHost(hosts.getLast(), false);
            startHost(false);
            assertEquals(closed, store.find(closed.id()).orElseThrow());
            request("POST", ROUTE, Map.of("requestId", requestId), 202);
            assertEquals(closed, store.find(closed.id()).orElseThrow());
            write("result.json", Map.of("passed", true, "executionId", id, "schema", schema,
                    "restartPreservedClosedUnknown", true, "realParentAndChildStopped", true,
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
                ToolUnknownReviewFixture.class.getName(), session.toString(), schema, Boolean.toString(fault))
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
