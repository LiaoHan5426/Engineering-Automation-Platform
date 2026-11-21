package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
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
 * Applies V1+V2 to a throwaway UUID-owned schema and verifies the message-graph DDL contract.
 * Never touches the application schema; no clean/repair/baseline. Opt-in via env var, consistent
 * with the other local-DB persistence tests.
 */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class ChatMessageGraphDdlTest {
    @TempDir Path session;

    private JdbcTemplate migrated(String schema) throws Exception {
        Path dir = session.resolve("migrations");
        Files.createDirectories(dir);
        for (String name : List.of("V1__initial_schema.sql", "V2__chat_message_graph.sql")) {
            String sql = new ClassPathResource("db/migration/" + name)
                    .getContentAsString(StandardCharsets.UTF_8)
                    .replace("eap.", schema + ".")
                    .replace("CREATE SCHEMA IF NOT EXISTS " + schema + ";",
                            "CREATE SCHEMA IF NOT EXISTS " + schema + ";");
            Files.writeString(dir.resolve(name), sql);
        }
        var source = ToolUnknownReviewFixture.originalDataSource();
        try (var conn = source.getConnection(); var stmt = conn.createStatement()) {
            stmt.execute("CREATE SCHEMA IF NOT EXISTS " + schema);
        }
        Flyway.configure().dataSource(source).schemas(schema).defaultSchema(schema)
                .locations("filesystem:" + dir.toAbsolutePath().toString().replace('\\', '/'))
                .cleanDisabled(true).load().migrate();
        return new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
    }

    private static String schema() {
        return "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
    }

    @Test
    void graphTablesMigrateAndEnforceImmutabilityAndBranchInvariants() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        UUID conv = UUID.randomUUID();
        Instant now = Instant.parse("2026-11-21T00:00:00Z");
        var store = new com.lh.eap.ai.graph.ChatMessageGraphStore(jdbc, schema);

        store.createConversation(conv, "/workspace", "ws", null, null, "model-x", now);
        assertEquals("local-operator", jdbc.queryForObject(
                "SELECT principal FROM " + schema + ".chat_conversation WHERE id=?", String.class, conv));

        // root user node
        UUID root = UUID.randomUUID();
        store.appendNode(new com.lh.eap.ai.graph.ChatMessageNode(
                root, conv, null, com.lh.eap.ai.graph.ChatMessageNode.Role.USER, 1, "question", null, null, null, 1, now));
        // first assistant answer, tied to an execution
        UUID a1 = UUID.randomUUID();
        UUID exec = UUID.randomUUID();
        store.appendNode(new com.lh.eap.ai.graph.ChatMessageNode(
                a1, conv, root, com.lh.eap.ai.graph.ChatMessageNode.Role.ASSISTANT, 1, "answer-1", null, "[]", exec, 2, now));
        // regenerated sibling (version 2) - old node stays untouched
        UUID a2 = UUID.randomUUID();
        store.appendNode(new com.lh.eap.ai.graph.ChatMessageNode(
                a2, conv, root, com.lh.eap.ai.graph.ChatMessageNode.Role.ASSISTANT, 2, "answer-2", null, "[]",
                UUID.randomUUID(), 3, now));

        assertEquals(3, store.countInConversation(conv));
        assertEquals(2, store.children(conv, root).size());
        assertEquals(List.of(root, a2), store.pathToRoot(conv, a2).stream()
                .map(com.lh.eap.ai.graph.ChatMessageNode::id).toList());
        // old branch path is still intact after adding a sibling
        assertEquals(List.of(root, a1), store.pathToRoot(conv, a1).stream()
                .map(com.lh.eap.ai.graph.ChatMessageNode::id).toList());
        assertEquals("answer-1", store.findNode(a1).orElseThrow().text());

        // duplicate sibling version is rejected
        assertThrows(DataIntegrityViolationException.class, () ->
                store.appendNode(new com.lh.eap.ai.graph.ChatMessageNode(
                        UUID.randomUUID(), conv, root, com.lh.eap.ai.graph.ChatMessageNode.Role.ASSISTANT, 2,
                        "dup", null, null, null, 4, now)));

        // A parent that lives in another conversation must be rejected by the composite FK:
        // insert a root under otherConv, then try to attach a child that claims conversation=conv.
        UUID otherConv = UUID.randomUUID();
        store.createConversation(otherConv, "/workspace2", "ws2", null, null, "m", now);
        UUID foreignRoot = UUID.randomUUID();
        store.appendNode(new com.lh.eap.ai.graph.ChatMessageNode(
                foreignRoot, otherConv, null, com.lh.eap.ai.graph.ChatMessageNode.Role.USER, 1,
                "foreign", null, null, null, 1, now));
        assertThrows(DataIntegrityViolationException.class, () ->
                store.appendNode(new com.lh.eap.ai.graph.ChatMessageNode(
                        UUID.randomUUID(), conv, foreignRoot,
                        com.lh.eap.ai.graph.ChatMessageNode.Role.USER, 2, "x", null, null, null, 5, now)));
    }

    @Test
    void nodesAreAppendOnly() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        UUID conv = UUID.randomUUID();
        Instant now = Instant.now();
        var store = new com.lh.eap.ai.graph.ChatMessageGraphStore(jdbc, schema);
        store.createConversation(conv, "/w", "w", null, null, null, now);
        UUID root = UUID.randomUUID();
        store.appendNode(new com.lh.eap.ai.graph.ChatMessageNode(
                root, conv, null, com.lh.eap.ai.graph.ChatMessageNode.Role.USER, 1, "q", null, null, null, 1, now));

        assertThrows(DataAccessException.class, () ->
                jdbc.update("UPDATE " + schema + ".chat_message SET sequence = sequence WHERE id=?", root));
        assertThrows(DataAccessException.class, () ->
                jdbc.update("DELETE FROM " + schema + ".chat_message WHERE id=?", root));
    }
}
