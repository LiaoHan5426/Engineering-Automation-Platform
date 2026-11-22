package com.lh.eap.application.service;

import com.lh.eap.core.BoardTaskStore;
import com.lh.eap.core.PrototypeVersionQuery;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class BoardVerificationPersistenceContractTest {
    private static BoardTaskService tasks(BoardTaskStore store) {
        return new BoardTaskService(store, mock(PrototypeVersionQuery.class), mock(WorkspaceInterlock.class));
    }
    private static BoardTaskStore.TaskRow row(UUID id) {
        return new BoardTaskStore.TaskRow(id, "p", "title", "ready", "", "", 1, List.of(), "none", "goal", "criteria", false, null);
    }
    @Test void activeVerificationBlocksExistingTaskMutationThroughTheSharedPredicate() {
        var store = mock(BoardTaskStore.class); var tasks = tasks(store); var id = UUID.randomUUID();
        when(store.find(id, "p", true)).thenReturn(Optional.of(row(id)));
        when(store.hasActiveExecution(id)).thenReturn(true);
        var denied = assertThrows(ResponseStatusException.class, () -> tasks.update(id, new BoardTaskService.Update("p", 1, "planned", null, null, null, null)));
        assertEquals("BOARD_EXECUTION_ACTIVE", denied.getReason());
        verify(store, never()).update(any(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyList());
    }
    @Test void workspaceExclusionAlsoFindsUnknownPreflightWithoutAPlan() {
        var store = mock(BoardTaskStore.class); var tasks = tasks(store);
        when(store.hasActiveVerification("workspace")).thenReturn(true);
        assertTrue(tasks.hasActiveVerification("workspace"), "preflight UNKNOWN has a workspace but no plan");
    }
    @Test void baselineAllowsUnplannedUnknownAndIndexesItsWorkspace() throws Exception {
        var resource = getClass().getResourceAsStream("/db/migration/V1__initial_schema.sql");
        assertNotNull(resource, "current initialization baseline is missing");
        try (resource) {
            var sql = new String(resource.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(sql.contains("board_verification_snapshot_shape"));
            assertTrue(sql.contains("verification_snapshot->'plan' = 'null'::jsonb"));
            assertTrue(sql.contains("BOARD_VERIFICATION_PROCESS_UNKNOWN"));
            assertTrue(sql.contains("COALESCE(verification_snapshot->'plan'->>'workspacePath', verification_snapshot->>'workspacePath')"));
            assertTrue(sql.contains("CREATE UNIQUE INDEX board_verification_one_active_workspace"));
            assertTrue(sql.contains("'QUEUED','RUNNING','UNKNOWN'"));
        }
    }
    @Test void baselineOwnsJsonSnapshotAndPersistentWorkspaceExclusion() throws Exception {
        var resource = getClass().getResourceAsStream("/db/migration/V1__initial_schema.sql");
        assertNotNull(resource, "verification persistence migration is missing");
        try (resource) {
            var sql = new String(resource.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(sql.contains("verification_snapshot jsonb"));
            assertTrue(sql.contains("CREATE UNIQUE INDEX board_verification_one_active_workspace"));
            assertTrue(sql.contains("'QUEUED','RUNNING','UNKNOWN'"));
            assertTrue(sql.contains("CREATE TABLE eap.board_task_run"));
        }
    }
}
