package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Applies V1+V2+V3+V4+V5 to a throwaway UUID-owned schema and verifies the SQL-expert UNKNOWN
 * manual resolution DDL contract against a real Postgres. Never touches the application schema.
 */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class ExpertAgentUnknownResolutionDdlTest {
    @org.junit.jupiter.api.extension.RegisterExtension
    final OwnedTestSchemas ownedSchemas = new OwnedTestSchemas();
    @TempDir Path session;

    private JdbcTemplate migrated(String schema) throws Exception {
        Path dir = session.resolve("migrations");
        Files.createDirectories(dir);
        for (String name : List.of("V1__initial_schema.sql", "V2__chat_message_graph.sql",
                "V3__chat_execution_log.sql", "V4__mission_unknown_resolution.sql",
                "V5__expert_agent_unknown_resolution.sql")) {
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
        return "eap_unknown_qa_" + UUID.randomUUID().toString().replace("-", "");
    }

    private static void seedRun(JdbcTemplate jdbc, String schema, UUID id, String state, String decision) {
        jdbc.update("INSERT INTO " + schema + ".task(id,goal,status,decision) VALUES (?,'review SQL','" + state + "',?)", id, decision);
        jdbc.update("INSERT INTO " + schema + ".expert_agent_run(task_id,expert_id,snapshot,request,state,decision,checkpoint,result)"
                + " VALUES (?,'sql-readonly-agent','{\"manifest\":{}}','{\"targetPath\":\"a.sql\"}',?,?,'{\"knowledgeGrants\":[]}','{\"status\":\"unknown\"}')",
                id, state, decision);
    }

    private static int resolve(JdbcTemplate jdbc, String schema, UUID id) {
        int changed = jdbc.update("""
                UPDATE %s.expert_agent_run
                   SET state='closed-unconfirmed',resolution_note=?,resolution_operator=?,resolved_at=now(),updated_at=now()
                 WHERE task_id=? AND expert_id='sql-readonly-agent' AND state='unknown'
                """.formatted(schema), "Checked the workspace file and the durable review record.", "local-operator", id);
        if (changed == 1) {
            jdbc.update("UPDATE " + schema + ".task SET status='closed-unconfirmed',decision='needs-review' WHERE id=?", id);
        }
        return changed;
    }

    @Test
    void migrationAddsAuditedTerminalStateWithoutChangingOtherStates() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        assertEquals(5, jdbc.queryForObject("SELECT count(*) FROM " + schema + ".flyway_schema_history WHERE success = true", Integer.class));
        assertEquals(3, jdbc.queryForObject(
                "SELECT count(*) FROM information_schema.columns WHERE table_schema='" + schema + "'"
                        + " AND table_name='expert_agent_run'"
                        + " AND column_name IN ('resolution_note','resolution_operator','resolved_at')",
                Integer.class));

        UUID id = UUID.randomUUID();
        seedRun(jdbc, schema, id, "unknown", "approved");
        assertEquals(1, resolve(jdbc, schema, id));
        assertEquals("closed-unconfirmed", jdbc.queryForObject("SELECT state FROM " + schema + ".expert_agent_run WHERE task_id=?", String.class, id));
        assertEquals("closed-unconfirmed", jdbc.queryForObject("SELECT status FROM " + schema + ".task WHERE id=?", String.class, id));
        assertEquals("needs-review", jdbc.queryForObject("SELECT decision FROM " + schema + ".task WHERE id=?", String.class, id));
        assertEquals("Checked the workspace file and the durable review record.",
                jdbc.queryForObject("SELECT resolution_note FROM " + schema + ".expert_agent_run WHERE task_id=?", String.class, id));
        assertEquals("local-operator",
                jdbc.queryForObject("SELECT resolution_operator FROM " + schema + ".expert_agent_run WHERE task_id=?", String.class, id));
        assertNotNull(jdbc.queryForObject("SELECT resolved_at FROM " + schema + ".expert_agent_run WHERE task_id=?", java.sql.Timestamp.class, id));
        // Evidence is preserved: no fabricated apply, no rewritten checkpoint/result.
        assertEquals("approved", jdbc.queryForObject("SELECT decision FROM " + schema + ".expert_agent_run WHERE task_id=?", String.class, id));
        assertEquals("unknown",
                jdbc.queryForObject("SELECT result->>'status' FROM " + schema + ".expert_agent_run WHERE task_id=?", String.class, id));
    }

    @Test
    void onlyUnknownRowsAreResolvableAndRepeatResolutionNeverOverwritesAudit() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        UUID unknown = UUID.randomUUID();
        UUID applied = UUID.randomUUID();
        seedRun(jdbc, schema, unknown, "unknown", "approved");
        seedRun(jdbc, schema, applied, "applied", "approved");

        assertEquals(0, resolve(jdbc, schema, applied));
        assertEquals("applied", jdbc.queryForObject("SELECT state FROM " + schema + ".expert_agent_run WHERE task_id=?", String.class, applied));
        assertEquals(1, resolve(jdbc, schema, unknown));
        assertEquals(0, resolve(jdbc, schema, unknown)); // second resolution is a conflict, not a new audit
        assertEquals("Checked the workspace file and the durable review record.",
                jdbc.queryForObject("SELECT resolution_note FROM " + schema + ".expert_agent_run WHERE task_id=?", String.class, unknown));
        assertEquals("applied", jdbc.queryForObject("SELECT status FROM " + schema + ".task WHERE id=?", String.class, applied));
    }
}
