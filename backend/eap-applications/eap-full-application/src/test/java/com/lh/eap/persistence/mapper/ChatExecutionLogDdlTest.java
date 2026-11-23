package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.ai.dto.ChatExecutionSnapshot;
import com.lh.eap.ai.execution.JdbcChatExecutionStore;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Applies V1+V2+V3 to a throwaway UUID-owned schema and verifies the CT-01 execution-log DDL
 * contract against a real Postgres. Never touches the application schema; opt-in via env var,
 * consistent with the other local-DB persistence tests.
 */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class ChatExecutionLogDdlTest {
    @org.junit.jupiter.api.extension.RegisterExtension
    final OwnedTestSchemas ownedSchemas = new OwnedTestSchemas();
    @TempDir Path session;

    private JdbcTemplate migrated(String schema) throws Exception {
        Path dir = session.resolve("migrations");
        Files.createDirectories(dir);
        for (String name : List.of("V1__initial_schema.sql", "V2__chat_message_graph.sql", "V3__chat_execution_log.sql")) {
            String sql = new ClassPathResource("db/migration/" + name)
                    .getContentAsString(StandardCharsets.UTF_8)
                    .replace("eap.", schema + ".")
                    .replace("CREATE SCHEMA IF NOT EXISTS eap;", "CREATE SCHEMA IF NOT EXISTS " + schema + ";");
            Files.writeString(dir.resolve(name), sql);
        }
        var source = ToolUnknownReviewFixture.originalDataSource();
        ownedSchemas.register(source, schema);
        try (var conn = source.getConnection(); var stmt = conn.createStatement()) {
            stmt.execute("CREATE SCHEMA IF NOT EXISTS " + schema);
        }
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                .locations("filesystem:" + dir.toAbsolutePath().toString().replace('\\', '/'))
                .cleanDisabled(true).load().migrate();
        return new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
    }

    private static String schema() {
        // Must match the owned-schema whitelist enforced by ToolUnknownReviewFixture.scopedDataSource.
        return "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
    }

    private static ChatExecutionEvent event(UUID executionId, UUID conversationId, long sequence,
            String type, String status, Object payload) {
        return ChatExecutionEvent.of(sequence, executionId, conversationId, null, type, "", "", status, payload);
    }

    @Test
    void executionLogMigratesAppendsAndReadsBack() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        var graph = new com.lh.eap.ai.graph.ChatMessageGraphStore(jdbc, schema);
        var store = new JdbcChatExecutionStore(jdbc, schema);
        UUID conv = UUID.randomUUID();
        Instant now = Instant.parse("2026-11-21T00:00:00Z");
        graph.createConversation(conv, "/workspace", "ws", null, null, "model-x", now);

        UUID finished = UUID.randomUUID();
        store.open(finished, conv, "RUNNING", now);
        store.appendEvent(event(finished, conv, 1, "status", "RUNNING", null));
        store.appendEvent(event(finished, conv, 2, "final", "SUCCEEDED", Map.of("error", "")));
        store.finish(finished, "SUCCEEDED", true, now);

        ChatExecutionSnapshot snap = store.read(conv, finished, 0).orElseThrow();
        assertTrue(snap.complete());
        assertEquals("SUCCEEDED", snap.status());
        assertEquals(2L, snap.latestSequence());
        assertEquals(List.of("status", "final"), snap.events().stream().map(ChatExecutionEvent::type).toList());
        assertNotNull(snap.events().get(1).payload());

        // cursor semantics through the real store
        assertEquals(1, store.read(conv, finished, 1).orElseThrow().events().size());
        assertTrue(store.read(UUID.randomUUID(), finished, 0).isEmpty());
    }

    @Test
    void unfinishedExecutionReplaysUnknownAndEventsAreAppendOnly() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        var graph = new com.lh.eap.ai.graph.ChatMessageGraphStore(jdbc, schema);
        var store = new JdbcChatExecutionStore(jdbc, schema);
        UUID conv = UUID.randomUUID();
        Instant now = Instant.now();
        graph.createConversation(conv, "/workspace", "ws", null, null, "model-x", now);

        UUID running = UUID.randomUUID();
        store.open(running, conv, "RUNNING", now);
        store.appendEvent(event(running, conv, 1, "answer.delta", "RUNNING", null));
        // no finish(): the process died mid-turn
        ChatExecutionSnapshot replay = store.read(conv, running, 0).orElseThrow();
        assertFalse(replay.complete());
        assertEquals("UNKNOWN", replay.status());

        // duplicate (execution, sequence) is rejected
        assertThrows(DataIntegrityViolationException.class,
                () -> store.appendEvent(event(running, conv, 1, "status", "RUNNING", null)));

        // event rows are immutable
        assertThrows(DataAccessException.class,
                () -> jdbc.update("UPDATE " + schema + ".chat_execution_event SET text='mutated' WHERE execution_id=?", running));
        assertThrows(DataAccessException.class,
                () -> jdbc.update("DELETE FROM " + schema + ".chat_execution_event WHERE execution_id=?", running));

        // an execution head cannot point at a non-existent conversation
        assertThrows(DataIntegrityViolationException.class,
                () -> store.open(UUID.randomUUID(), UUID.randomUUID(), "RUNNING", now));
    }
}
