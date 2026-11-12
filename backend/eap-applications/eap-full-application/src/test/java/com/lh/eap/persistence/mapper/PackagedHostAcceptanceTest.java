package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import java.net.URI;
import java.net.ServerSocket;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

/** Runs packaged application/dependencies with only an isolated test DataSource added to the loader. */
@EnabledIfEnvironmentVariable(named="EAP_PACKAGED_HOST", matches="true")
class PackagedHostAcceptanceTest {
    @Configuration(proxyBeanMethods=false)
    public static class IsolatedData {
        @Bean @Primary DataSource packagedTestDataSource() {
            return ToolUnknownReviewFixture.scopedDataSource(System.getenv("EAP_PACKAGED_SCHEMA"));
        }
    }
    @Test void startsThePackagedHostAndExercisesCurrentHttpContracts() throws Exception {
        String supplied = System.getenv("EAP_PACKAGED_JAR");
        assertNotNull(supplied, "Explicit packaged JAR required");
        var jar = Path.of(supplied).toAbsolutePath();
        assertTrue(Files.isRegularFile(jar));
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "packaged-host-");
        var schema = "eap_unknown_qa_"+UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        Process process = null;
        try {
            CurrentContractTestSchema.migrate(session,schema,"36");
            int port;
            try (var socket=new ServerSocket(0)) { port=socket.getLocalPort(); }
            var workspace = Files.createDirectory(session.resolve("workspace"));
            var command = new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java").toString(),
                    "-Dloader.path="+Path.of("target/test-classes").toAbsolutePath(),
                    "-Djava.io.tmpdir="+session,
                    "-cp",jar.toString(),"org.springframework.boot.loader.launch.PropertiesLauncher",
                    "--spring.main.sources="+IsolatedData.class.getName(),
                    "--server.address=127.0.0.1","--server.port="+port,
                    "--spring.flyway.enabled=false","--spring.devtools.restart.enabled=false",
                    "--eap.ai.connection-store="+session.resolve("connections.json"),
                    "--eap.ai.artifact-root="+session.resolve("artifacts"),
                    "--eap.runtime.workspace="+workspace,"--eap.runtime.authorized-root="+workspace);
            command.environment().put("EAP_PACKAGED_SCHEMA",schema);
            command.redirectErrorStream(true).redirectOutput(session.resolve("application.log").toFile());
            process=command.start();
            var client=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
            var base="http://127.0.0.1:"+port;
            HttpResponse<String> health=null;
            long deadline=System.nanoTime()+Duration.ofSeconds(45).toNanos();
            while (System.nanoTime()<deadline && process.isAlive()) {
                try { health=client.send(HttpRequest.newBuilder(URI.create(base+"/api/health")).timeout(Duration.ofSeconds(2)).build(),HttpResponse.BodyHandlers.ofString()); if(health.statusCode()==200) break; }
                catch (java.io.IOException unavailable) { }
                Thread.sleep(250);
            }
            assertNotNull(health,"Packaged host failed to become ready: "+session);
            assertEquals(200,health.statusCode());
            var json=JsonMapper.builder().build();
            var opened=client.send(HttpRequest.newBuilder(URI.create(base+"/api/ai/conversations")).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString("{}")).build(),HttpResponse.BodyHandlers.ofString());
            assertEquals(200,opened.statusCode(),opened.body());
            String id=json.readTree(opened.body()).path("conversationId").asString();
            var history=client.send(HttpRequest.newBuilder(URI.create(base+"/api/ai/conversations/"+id+"/model-history")).build(),HttpResponse.BodyHandlers.ofString());
            assertEquals(200,history.statusCode());
            assertEquals(0,json.readTree(history.body()).path("messages").asInt());
            Files.writeString(session.resolve("validation.json"),json.writeValueAsString(Map.of("jar",jar.toString(),"health",200,"openConversation",200,"modelHistory",200,"modelCalls",0,"isolatedDataSource",true,"archiveApplicationClasses",true)));
        } finally {
            if(process!=null && process.isAlive()) { process.destroy(); if(!process.waitFor(10,TimeUnit.SECONDS)) { process.destroyForcibly(); assertTrue(process.waitFor(10,TimeUnit.SECONDS)); } }
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
        }
    }
}
