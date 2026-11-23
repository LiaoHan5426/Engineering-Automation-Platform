package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import com.lh.eap.domain.model.Mission;
import com.lh.eap.persistence.jdbc.StateBindings;

/**
 * Applies V1+V2+V3+V4 to a throwaway UUID-owned schema and verifies the Mission UNKNOWN manual
 * resolution DDL contract against a real Postgres. Never touches the application schema; opt-in
 * via env var, consistent with the other local-DB persistence tests.
 */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_BOARD_PERSISTENCE", matches = "true")
class MissionUnknownResolutionDdlTest {
    @org.junit.jupiter.api.extension.RegisterExtension
    final OwnedTestSchemas ownedSchemas = new OwnedTestSchemas();
    @TempDir Path session;

    private JdbcTemplate migrated(String schema) throws Exception {
        Path dir = session.resolve("migrations");
        Files.createDirectories(dir);
        for (String name : List.of("V1__initial_schema.sql", "V2__chat_message_graph.sql",
                "V3__chat_execution_log.sql", "V4__mission_unknown_resolution.sql")) {
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

    private static void seedMission(JdbcTemplate jdbc, String schema, UUID missionId) {
        UUID handoff = UUID.randomUUID();
        jdbc.update("INSERT INTO " + schema + ".handoff(id,source,source_ref,summary) VALUES (?,'builder','mission-resolution','review fixture')", handoff);
        jdbc.update("INSERT INTO " + schema + ".mission(id,handoff_id,status,execution,approval,verification,grant_state,created_at)"
                + " VALUES (?,?,'created','not_started','not_requested','not_requested','none',now())", missionId, handoff);
    }

    private static void seedUnknownExecution(JdbcTemplate jdbc, String schema, UUID id, UUID missionId) {
        jdbc.update("""
                INSERT INTO %s.mission_execution(
                    id, mission_id, status, capability, principal, workspace_path, workspace_label,
                    executable, policy_snapshot, started_at, approval, created_at, unconfirmed_reason)
                VALUES (?,?,'RUNNING','git-status','local-operator','/ws','owned','git','policy',now(),'NOT_REQUIRED',now(),?)
                """.formatted(schema), id, missionId, "SERVICE_RESTART_EXIT_UNCONFIRMED");
    }

    @Test
    void resolutionColumnAndStatusConstraintExist() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        assertEquals(4, jdbc.queryForObject("SELECT count(*) FROM " + schema + ".flyway_schema_history WHERE success = true", Integer.class));

        UUID missionId = UUID.randomUUID();
        seedMission(jdbc, schema, missionId);
        UUID id = UUID.randomUUID();
        seedUnknownExecution(jdbc, schema, id, missionId);

        // Unknown rows never carry exit evidence; resolution adds audit only.
        Instant at = Instant.parse("2026-11-21T10:00:00Z");
        int updated = jdbc.update("""
                UPDATE %s.mission_execution
                SET status = ?, resolution_note = ?, resolution_operator = ?, resolved_at = ?
                WHERE id = ? AND status = ANY(?::text[]) AND unconfirmed_reason IS NOT NULL AND resolution_note IS NULL
                """.formatted(schema), "CLOSED_UNCONFIRMED", "Reviewed process identity and logs", "local-operator",
                Timestamp.from(at), id, StateBindings.MISSION_ACTIVE);
        assertEquals(1, updated);

        var row = jdbc.queryForMap("SELECT status, exit_code, exit_evidence, unconfirmed_reason, "
                + "resolution_note, resolution_operator, resolved_at FROM " + schema + ".mission_execution WHERE id = ?", id);
        assertEquals("CLOSED_UNCONFIRMED", row.get("status"));
        assertNull(row.get("exit_code"));
        assertNull(row.get("exit_evidence"));
        assertEquals("SERVICE_RESTART_EXIT_UNCONFIRMED", row.get("unconfirmed_reason"));
        assertEquals("Reviewed process identity and logs", row.get("resolution_note"));
        assertEquals("local-operator", row.get("resolution_operator"));
        assertNotNull(row.get("resolved_at"));
        assertEquals("not_started", jdbc.queryForObject("SELECT execution FROM " + schema + ".mission WHERE id = ?", String.class, missionId));

        // Second resolution is a conflict: conditional WHERE yields 0 rows and audit is unchanged.
        int again = jdbc.update("""
                UPDATE %s.mission_execution
                SET status = ?, resolution_note = ?, resolution_operator = ?, resolved_at = ?
                WHERE id = ? AND status = ANY(?::text[]) AND unconfirmed_reason IS NOT NULL AND resolution_note IS NULL
                """.formatted(schema), "CLOSED_UNCONFIRMED", "Reviewed again fully", "local-operator",
                Timestamp.from(at), id, StateBindings.MISSION_ACTIVE);
        assertEquals(0, again);
        assertEquals("Reviewed process identity and logs",
                jdbc.queryForObject("SELECT resolution_note FROM " + schema + ".mission_execution WHERE id = ?", String.class, id));
    }

    @Test
    void onlyUnknownInFlightRowsCanBeResolved() throws Exception {
        String schema = schema();
        JdbcTemplate jdbc = migrated(schema);
        // One mission per scenario: the mission_execution_one_open partial unique index permits
        // only a single in-flight row per mission.
        UUID confirmedMission = UUID.randomUUID();
        seedMission(jdbc, schema, confirmedMission);
        UUID terminalMission = UUID.randomUUID();
        seedMission(jdbc, schema, terminalMission);
        UUID resolvedMission = UUID.randomUUID();
        seedMission(jdbc, schema, resolvedMission);

        // In-flight but not marked unknown -> not resolvable.
        UUID confirmed = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO %s.mission_execution(
                    id, mission_id, status, capability, principal, workspace_path, workspace_label,
                    executable, policy_snapshot, started_at, approval, created_at)
                VALUES (?,?,'RUNNING','git-status','local-operator','/ws','owned','git','policy',now(),'NOT_REQUIRED',now())
                """.formatted(schema), confirmed, confirmedMission);
        int updated = jdbc.update("""
                UPDATE %s.mission_execution SET status = ?, resolution_note = ?, resolution_operator = ?, resolved_at = ?
                WHERE id = ? AND status = ANY(?::text[]) AND unconfirmed_reason IS NOT NULL AND resolution_note IS NULL
                """.formatted(schema), "CLOSED_UNCONFIRMED", "Reviewed process identity", "local-operator",
                Timestamp.from(Instant.now()), confirmed, StateBindings.MISSION_ACTIVE);
        assertEquals(0, updated);

        // Terminal status cannot be resolved either.
        UUID terminal = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO %s.mission_execution(
                    id, mission_id, status, capability, principal, workspace_path, workspace_label,
                    executable, policy_snapshot, started_at, finished_at, exit_code, exit_evidence,
                    approval, created_at, unconfirmed_reason)
                VALUES (?,?,'SUCCEEDED','git-status','local-operator','/ws','owned','git','policy',now(),now(),0,'tree cleaned','NOT_REQUIRED',now(),?)
                """.formatted(schema), terminal, terminalMission, "SERVICE_RESTART_EXIT_UNCONFIRMED");
        int terminalUpdated = jdbc.update("""
                UPDATE %s.mission_execution SET status = ?, resolution_note = ?, resolution_operator = ?, resolved_at = ?
                WHERE id = ? AND status = ANY(?::text[]) AND unconfirmed_reason IS NOT NULL AND resolution_note IS NULL
                """.formatted(schema), "CLOSED_UNCONFIRMED", "Reviewed process identity", "local-operator",
                Timestamp.from(Instant.now()), terminal, StateBindings.MISSION_ACTIVE);
        assertEquals(0, terminalUpdated);

        // Fabricated exit on a resolved row is still blocked by the terminal-evidence contract.
        UUID resolved = UUID.randomUUID();
        seedUnknownExecution(jdbc, schema, resolved, resolvedMission);
        jdbc.update("""
                UPDATE %s.mission_execution SET status = 'CLOSED_UNCONFIRMED', resolution_note = ?, resolution_operator = ?, resolved_at = now()
                WHERE id = ?
                """.formatted(schema), "Reviewed process identity fully", "local-operator", resolved);
        assertThrows(DataIntegrityViolationException.class, () ->
                jdbc.update("UPDATE " + schema + ".mission_execution SET status = 'CANCELLED' WHERE id = ?", resolved));
    }
}
