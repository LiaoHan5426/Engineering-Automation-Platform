package com.lh.eap.application.service;

import com.lh.eap.core.BoardTaskStore;
import com.lh.eap.core.PrototypeVersionQuery;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

class BoardTaskServiceTest {
    private final BoardTaskStore store = mock(BoardTaskStore.class);
    private final BoardTaskService service = new BoardTaskService(store, mock(PrototypeVersionQuery.class), mock(WorkspaceInterlock.class));
    private final UUID id = UUID.randomUUID();
    private BoardTaskService.Task task(String column, String goal, String criteria) {
        return new BoardTaskService.Task(id, "group", "task", column, "", "", 3, List.of("created"), "none", goal, criteria, false, null);
    }
    private static BoardTaskStore.TaskRow row(BoardTaskService.Task task) {
        return new BoardTaskStore.TaskRow(task.id(), task.projectId(), task.title(), task.column(), task.notes(),
                task.sessionId(), task.revision(), task.events(), task.priority(), task.goal(),
                task.acceptanceCriteria(), task.executionActive(), task.prototypeVersionId());
    }
    private BoardTaskService.Update update(String project, long revision, String column, String goal, String criteria) {
        return new BoardTaskService.Update(project, revision, column, null, null, goal, criteria);
    }
    private void found(BoardTaskService.Task task) {
        when(store.find(id, "group", true)).thenReturn(Optional.of(row(task)));
        when(store.find(id, "group", false)).thenReturn(Optional.of(row(task)));
    }
    private void rejects(String reason, Runnable action) {
        assertEquals(reason, assertThrows(ResponseStatusException.class, action::run).getReason());
    }
    @Test void initialReadyRequiresPreparationAndCreationRequiresRetryIdentity() {
        rejects("BOARD_PREPARATION_REQUIRED", () -> service.create(new BoardTaskService.Draft("group", "task", "", "ready", "", "test passes", UUID.randomUUID())));
        assertThrows(IllegalArgumentException.class, () -> service.create(new BoardTaskService.Draft("group", "task", "", "planned", "", "", null)));
        assertThrows(IllegalArgumentException.class, () -> service.create(new BoardTaskService.Draft("group", "task", "", "running", "goal", "checks", UUID.randomUUID())));
        verifyNoInteractions(store);
    }
    @Test void rejectsStaleRevisionBeforeWritingAnything() {
        found(task("planned", "goal", "criteria"));
        rejects("BOARD_REVISION_CONFLICT", () -> service.update(id, update("group", 2, "ready", null, null)));
        verify(store, never()).update(any(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyList());
    }
    @Test void requiresProjectScopeAndDoesNotRevealOtherProjectsTask() {
        assertThrows(IllegalArgumentException.class, () -> service.update(id, update(null, 3, "ready", null, null)));
        rejects("BOARD_TASK_NOT_FOUND", () -> service.update(id, update("other", 3, "ready", null, null)));
        verify(store, never()).update(any(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyList());
    }
    @Test void incompletePreparationCannotBeReadyAndExecutionCannotBeInvented() {
        found(task("planned", "", "criteria"));
        rejects("BOARD_PREPARATION_REQUIRED", () -> service.update(id, update("group", 3, "ready", null, null)));
        rejects("BOARD_EXECUTION_EVIDENCE_REQUIRED", () -> service.update(id, update("group", 3, "done", "goal", "criteria")));
        verify(store, never()).update(any(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyList());
    }
    @Test void cannotClearPreparationWhileReadyButCanReturnToPlanning() {
        found(task("ready", "goal", "criteria"));
        rejects("BOARD_PREPARATION_REQUIRED", () -> service.update(id, update("group", 3, null, "  ", null)));
        when(store.hasActiveExecution(id)).thenReturn(false);
        service.update(id, update("group", 3, "planned", "", null));
        verify(store).update(eq(id), eq("group"), eq("planned"), eq(""), eq("none"), eq(""), eq("criteria"), anyList());
    }
    @Test void noOpDoesNotAdvanceRevisionAndBoundsAreCheckedBeforeRedaction() {
        found(task("planned", "goal", "criteria"));
        assertEquals(3, service.update(id, update("group", 3, "planned", "goal", "criteria")).revision());
        assertThrows(IllegalArgumentException.class, () -> service.update(id, update("group", 3, null, "x".repeat(4001), null)));
        verify(store, never()).update(any(), anyString(), anyString(), anyString(), anyString(), anyString(), anyString(), anyList());
    }
    @Test void publishesPreparationIssuesAndAllowedColumnsAsJson() {
        var incomplete = task("ready", "", "");
        assertEquals(List.of("goal", "acceptanceCriteria"), incomplete.preparationIssues());
        assertEquals(List.of("planned"), incomplete.allowedColumns());
        var json = JsonMapper.builder().build().readTree(JsonMapper.builder().build().writeValueAsString(incomplete));
        assertEquals("goal", json.get("preparationIssues").get(0).asString());
        assertEquals("planned", json.get("allowedColumns").get(0).asString());
        assertEquals(List.of("planned", "ready"), task("planned", "goal", "criteria").allowedColumns());
        assertTrue(task("running", "goal", "criteria").allowedColumns().isEmpty());
    }
    @Test void validatesOnlySupportedPrioritiesAndBacklogTransitions() {
        for (var value : List.of("none", "p0", "p1", "p2")) assertEquals(value, BoardTaskService.validatePriority(value));
        assertThrows(IllegalArgumentException.class, () -> BoardTaskService.validatePriority("urgent"));
        assertThrows(IllegalArgumentException.class, () -> BoardTaskService.validatePriority(null));
        assertTrue(BoardTaskService.allowed("planned", "ready"));
        assertTrue(BoardTaskService.allowed("ready", "planned"));
        assertFalse(BoardTaskService.allowed("ready", "running"));
        assertFalse(BoardTaskService.allowed("acceptance", "done"));
        assertFalse(BoardTaskService.allowed("running", "running"));
    }
}
