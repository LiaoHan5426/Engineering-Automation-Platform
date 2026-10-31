package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;

class BoardVerificationPersistenceContractTest {
    @Test void activeVerificationBlocksExistingTaskMutationThroughTheSharedPredicate() {
        var jdbc = mock(JdbcTemplate.class); var tasks = new BoardTaskService(jdbc); var id = UUID.randomUUID();
        var task = new BoardTaskService.Task(id, "p", "title", "ready", "", "", 1, List.of(), "none", "goal", "criteria", false, null);
        when(jdbc.query(anyString(), any(RowMapper.class), eq(id), eq("p"))).thenReturn(List.of(task));
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(id))).thenAnswer(call -> ((String)call.getArgument(0)).contains("verification_snapshot") && ((String)call.getArgument(0)).contains("UNKNOWN"));
        var denied = assertThrows(ResponseStatusException.class, () -> tasks.update(id, new BoardTaskService.Update("p", 1, "planned", null, null, null, null)));
        assertEquals("BOARD_EXECUTION_ACTIVE", denied.getReason());
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void workspaceExclusionAlsoFindsUnknownPreflightWithoutAPlan() {
        var jdbc = mock(JdbcTemplate.class); var tasks = new BoardTaskService(jdbc);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq("workspace"))).thenAnswer(call -> {
            String sql = call.getArgument(0);
            return sql.contains("COALESCE(r.verification_snapshot->'plan'->>'workspacePath', r.verification_snapshot->>'workspacePath')")
                && sql.contains("'UNKNOWN'");
        });
        assertTrue(tasks.hasActiveVerification("workspace"), "preflight UNKNOWN has a workspace but no plan");
    }
    @Test void incrementalMigrationAllowsUnplannedUnknownAndIndexesItsWorkspace() throws Exception {
        var resource = getClass().getResourceAsStream("/db/migration/V10__board_verification_preflight_unknown.sql");
        assertNotNull(resource, "V9 is already deployed; preflight UNKNOWN needs an incremental migration");
        try (resource) {
            var sql = new String(resource.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(sql.contains("DROP CONSTRAINT board_verification_snapshot_shape"));
            assertTrue(sql.contains("verification_snapshot->'plan' = 'null'::jsonb"));
            assertTrue(sql.contains("BOARD_VERIFICATION_PROCESS_UNKNOWN"));
            assertTrue(sql.contains("COALESCE(verification_snapshot->'plan'->>'workspacePath', verification_snapshot->>'workspacePath')"));
            assertTrue(sql.contains("CREATE UNIQUE INDEX board_verification_one_active_workspace"));
            assertTrue(sql.contains("'QUEUED','RUNNING','UNKNOWN'"));
        }
    }
    @Test void migrationAddsOneJsonSnapshotAndPersistentWorkspaceExclusion() throws Exception {
        var resource = getClass().getResourceAsStream("/db/migration/V9__board_run_verification.sql");
        assertNotNull(resource, "verification persistence migration is missing");
        try (resource) {
            var sql = new String(resource.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(sql.contains("verification_snapshot jsonb"));
            assertTrue(sql.contains("CREATE UNIQUE INDEX board_verification_one_active_workspace"));
            assertTrue(sql.contains("'QUEUED','RUNNING','UNKNOWN'"));
            assertFalse(sql.contains("CREATE TABLE"));
        }
    }
}
