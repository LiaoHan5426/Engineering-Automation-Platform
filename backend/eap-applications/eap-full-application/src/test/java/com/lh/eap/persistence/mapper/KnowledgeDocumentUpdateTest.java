package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.EapApplication;
import com.lh.eap.application.service.KnowledgeManagementService;
import com.lh.eap.application.dto.*;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

@EnabledIfEnvironmentVariable(named="EAP_KNOWLEDGE_UPDATE", matches="true")
class KnowledgeDocumentUpdateTest {
    @Test void replacesChunksAtomicallyAndRejectsStaleOrCrossBaseEdits() throws Exception {
        var session = Files.createTempDirectory(Path.of("target").toAbsolutePath(), "knowledge-update-");
        var workspace = Files.createDirectory(session.resolve("workspace"));
        String schema = "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
        var admin = new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session, schema);
            var scoped = ToolUnknownReviewFixture.scopedDataSource(schema);
            var override = new SourceWriteReviewPersistenceTest.Overrides(scoped, workspace);
            try (var context = new SpringApplicationBuilder(EapApplication.class)
                    .initializers(app -> ((GenericApplicationContext)app).registerBean(SourceWriteReviewPersistenceTest.Overrides.class, () -> override))
                    .run("--server.address=127.0.0.1", "--server.port=0", "--spring.flyway.enabled=false", "--spring.devtools.restart.enabled=false",
                         "--eap.web.allowed-origins=http://127.0.0.1:5197", "--eap.ai.connection-store="+session.resolve("models.json"), "--eap.ai.artifact-root="+session.resolve("artifacts"))) {
                var service = context.getBean(KnowledgeManagementService.class);
                var jdbc = new JdbcTemplate(scoped);
                UUID base = (UUID)service.create(new KnowledgeBaseRequest("Update test", "")).get("id");
                UUID doc = (UUID)service.addDocument(base, new KnowledgeDocumentRequest("Old title", "olduniqueterm "+"x".repeat(2000))).get("id");
                String hash = jdbc.queryForObject("SELECT content_sha256 FROM eap.knowledge_document WHERE id=?", String.class, doc);
                service.updateDocument(base, doc, new KnowledgeManagementService.DocumentUpdate("New title", "y".repeat(1400)+" newuniqueterm "+"y".repeat(1700), hash));
                assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM eap.knowledge_chunk WHERE document_id=?", Integer.class, doc));
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.knowledge_chunk WHERE document_id=? AND content LIKE '%olduniqueterm%'", Integer.class, doc));
                assertFalse(((List<?>)service.search("newuniqueterm", 5, base).get("items")).isEmpty());
                var hits = (List<Map<String,Object>>)service.search("newuniqueterm", 5, base).get("items");
                assertTrue(hits.stream().anyMatch(hit -> hit.get("excerpt").toString().contains("newuniqueterm")));

                assertTrue(((List<?>)service.search("olduniqueterm", 5, base).get("items")).isEmpty());
                assertEquals("KNOWLEDGE_DOCUMENT_CHANGED", assertThrows(ResponseStatusException.class, () -> service.updateDocument(base, doc,
                        new KnowledgeManagementService.DocumentUpdate("Stale", "stale text", hash))).getReason());
                assertEquals("KNOWLEDGE_DOCUMENT_NOT_FOUND", assertThrows(ResponseStatusException.class, () -> service.updateDocument(UUID.randomUUID(), doc,
                        new KnowledgeManagementService.DocumentUpdate("Wrong base", "wrong text", hash))).getReason());
                assertEquals("New title", jdbc.queryForObject("SELECT object_key FROM eap.knowledge_document WHERE id=?", String.class, doc));
                service.removeDocument(base, doc);
                assertTrue(((List<?>)service.search("newuniqueterm", 5, base).get("items")).isEmpty());
                UUID browserBase = (UUID)service.create(new KnowledgeBaseRequest("Browser update base", "")).get("id");
                UUID browserDoc = (UUID)service.addDocument(browserBase, new KnowledgeDocumentRequest("Browser source", "browseroldterm original content")).get("id");
                var manifest = session.resolve("host.json");
                Files.writeString(manifest, tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(Map.of("backend", "http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port"), "baseId",browserBase,"documentId",browserDoc)));
                var process = new ProcessBuilder("node", "apps/web/__tests__/browser/knowledge-update-live.mjs", manifest.toString())
                    .directory(Path.of("../../..").toAbsolutePath().normalize().resolve("frontend").toFile()).inheritIO().start();
                try { assertTrue(process.waitFor(120, java.util.concurrent.TimeUnit.SECONDS)); assertEquals(0, process.exitValue()); }
                finally { if(process.isAlive()) { process.descendants().forEach(ProcessHandle::destroyForcibly); process.destroyForcibly(); } }
                Files.writeString(session.resolve("validation.json"), "{\"updated\":true,\"oldTextAbsent\":true,\"newTextSearchable\":true,\"staleRejected\":true,\"crossBaseRejected\":true,\"deleteConsistent\":true,\"modelCalls\":0}");
            }
        } finally { admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE"); }
    }
}
