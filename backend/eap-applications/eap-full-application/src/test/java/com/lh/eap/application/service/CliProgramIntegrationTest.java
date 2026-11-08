package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.EapApplication;
import java.net.URI;
import java.net.http.*;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.flywaydb.core.Flyway;
import tools.jackson.databind.json.JsonMapper;

/** Full HTTP / Spring / Flyway / PostgreSQL test against an owned disposable database. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_CLI_INTEGRATION", matches="true")
class CliProgramIntegrationTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private String base;

    @Test void registrationsCanBeExecutedByExpertsAndReferencesProtectDeletion() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        var adminUrl = env.getProperty("spring.datasource.url");
        assertNotNull(adminUrl);
        if (!adminUrl.startsWith("jdbc:postgresql://127.0.0.1:") && !adminUrl.startsWith("jdbc:postgresql://localhost:")) fail("集成测试仅允许本机 PostgreSQL");
        var user = env.getProperty("spring.datasource.username");
        var password = env.getProperty("spring.datasource.password");
        var database = "eap_cli_qa_" + UUID.randomUUID().toString().replace("-", "");
        var authorityEnd = adminUrl.indexOf('/', "jdbc:postgresql://".length());
        var testUrl = adminUrl.substring(0, authorityEnd + 1) + database + "?currentSchema=eap";
        try (var admin = DriverManager.getConnection(adminUrl, user, password)) {
            try (var statement = admin.createStatement()) { statement.execute("CREATE DATABASE \"" + database + "\""); }
            try {
                Flyway.configure().dataSource(testUrl,user,password).schemas("eap").defaultSchema("eap")
                        .locations("classpath:db/migration").load().migrate();
                try (var configured = DriverManager.getConnection(testUrl,user,password); var statement = configured.createStatement()) {
                    statement.execute("INSERT INTO eap.cli_channel(capability,binary_path) VALUES ('git','configured-git-binary')");
                }
                try (var context = new SpringApplicationBuilder(EapApplication.class).run(
                        "--spring.datasource.url=" + testUrl, "--server.port=0", "--eap.llm.enabled=false", "--spring.devtools.restart.enabled=false")) {
                    base = "http://127.0.0.1:" + context.getEnvironment().getProperty("local.server.port") + "/api";
                    var initial = request("GET", "/cli-programs", null, 200);
                    assertEquals(2, ((List<?>) initial.get("items")).size());
                    @SuppressWarnings("unchecked") var programViews = (List<Map<String,Object>>) initial.get("items");
                    @SuppressWarnings("unchecked") var gitChannel = (Map<String,Object>) programViews.stream().filter(p -> "git".equals(p.get("id"))).findFirst().orElseThrow().get("channel");
                    assertEquals("configured-git-binary", gitChannel.get("binary"), "程序级覆盖值在应用启动后保持不变");
                    var javaBinary = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win") ? "java.exe" : "java").toString();
                    request("POST", "/cli-programs", Map.of("id", "qa-java", "name", "QA Java", "binary", javaBinary), 200);
                    var operation = Map.of("capabilityId", "qa.java-version", "title", "Java 版本", "args", List.of("--version"), "description", "只读版本检查");
                    request("POST", "/cli-programs/qa-java/operations/qa.java-version", operation, 200);
                    var catalog = request("GET", "/capabilities", null, 200);
                    assertTrue(((List<?>) catalog.get("globallyUsable")).contains("qa.java-version"));
                    assertTrue(((List<?>) catalog.get("undeclared")).isEmpty());
                    assertTrue(((List<?>) catalog.get("unregistered")).isEmpty());
                    var manifest = Map.of("apiVersion", "eap/v1", "kind", "Expert", "id", "qa-cli", "name", "QA CLI",
                            "steps", List.of(Map.of("id", "version", "capability", "qa.java-version", "required", true)),
                            "edges", List.of(), "rules", List.of("database.credentials.never-expose"));
                    request("POST", "/experts", Map.of("id", "qa-cli", "name", "QA CLI", "manifest", JSON.writeValueAsString(manifest)), 200);
                    request("PUT", "/experts/qa-cli/activation", Map.of("enabled", true), 200);
                    var execution = request("POST", "/experts/qa-cli/execute", Map.of("question", "检查 Java 版本"), 200);
                    assertTrue(((List<?>) execution.get("executedCapabilities")).contains("qa.java-version"));
                    assertEquals("completed", execution.get("status"));
                    request("DELETE", "/cli-programs/qa-java/operations/qa.java-version", null, 409);
                    request("PUT", "/cli-programs/qa-java/operations/qa.java-version", operation, 409);
                    request("PUT", "/experts/qa-cli/activation", Map.of("enabled", false), 200);
                    request("PUT", "/cli-programs/qa-java/operations/qa.java-version", operation, 200);
                    assertEquals(true, request("POST", "/cli-programs/qa-java/probe", Map.of(), 200).get("success"));
                    request("DELETE", "/cli-programs/qa-java/operations/qa.java-version", null, 200);
                    assertEquals(2, ((List<?>) request("GET", "/cli-programs", null, 200).get("items")).size());
                    request("DELETE", "/cli-programs/git", null, 409);
                }
            } finally {
                if (!database.matches("eap_cli_qa_[a-f0-9]{32}")) throw new IllegalStateException("拒绝清理非测试数据库");
                try (var statement = admin.createStatement()) { statement.execute("DROP DATABASE \"" + database + "\""); }
            }
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String,Object> request(String method, String path, Object body, int expectedStatus) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(base + path)).timeout(Duration.ofSeconds(60)).header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body))).build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(expectedStatus, response.statusCode(), method + " " + path + ": " + response.body());
        return JSON.readValue(response.body(), Map.class);
    }
}
