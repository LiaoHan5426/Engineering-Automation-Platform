package com.lh.eap.application.service;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

class BoardTaskServiceTest {
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final BoardTaskService service = new BoardTaskService(jdbc);
    private final UUID id = UUID.randomUUID();
    private BoardTaskService.Task task(String column, String goal, String criteria) {
        return new BoardTaskService.Task(id, "group", "task", column, "", "", 3, List.of("created"), "none", goal, criteria, false);
    }
    private BoardTaskService.Update update(String project, long revision, String column, String goal, String criteria) {
        return new BoardTaskService.Update(project, revision, column, null, null, goal, criteria);
    }
    @SuppressWarnings("unchecked") private void found(BoardTaskService.Task task) {
        when(jdbc.query(anyString(), any(RowMapper.class), eq(id), eq("group"))).thenReturn(List.of(task));
    }
    private void rejects(String reason, Runnable action) {
        assertEquals(reason, assertThrows(ResponseStatusException.class, action::run).getReason());
    }
    @Test void initialReadyRequiresPreparationAndCreationRequiresRetryIdentity() {
        rejects("BOARD_PREPARATION_REQUIRED", () -> service.create(new BoardTaskService.Draft("group", "task", "", "ready", "", "test passes", UUID.randomUUID())));
        assertThrows(IllegalArgumentException.class, () -> service.create(new BoardTaskService.Draft("group", "task", "", "planned", "", "", null)));
        assertThrows(IllegalArgumentException.class, () -> service.create(new BoardTaskService.Draft("group", "task", "", "running", "goal", "checks", UUID.randomUUID())));
        verifyNoInteractions(jdbc);
    }
    @Test void rejectsStaleRevisionBeforeWritingAnything() {
        found(task("planned", "goal", "criteria"));
        rejects("BOARD_REVISION_CONFLICT", () -> service.update(id, update("group", 2, "ready", null, null)));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void requiresProjectScopeAndDoesNotRevealOtherProjectsTask() {
        assertThrows(IllegalArgumentException.class, () -> service.update(id, update(null, 3, "ready", null, null)));
        rejects("BOARD_TASK_NOT_FOUND", () -> service.update(id, update("other", 3, "ready", null, null)));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void incompletePreparationCannotBeReadyAndExecutionCannotBeInvented() {
        found(task("planned", "", "criteria"));
        rejects("BOARD_PREPARATION_REQUIRED", () -> service.update(id, update("group", 3, "ready", null, null)));
        rejects("BOARD_EXECUTION_EVIDENCE_REQUIRED", () -> service.update(id, update("group", 3, "done", "goal", "criteria")));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }
    @Test void cannotClearPreparationWhileReadyButCanReturnToPlanning() {
        found(task("ready", "goal", "criteria"));
        rejects("BOARD_PREPARATION_REQUIRED", () -> service.update(id, update("group", 3, null, "  ", null)));
        service.update(id, update("group", 3, "planned", "", null));
        verify(jdbc).update(startsWith("UPDATE eap.board_task"), eq("planned"), eq(""), eq("none"), eq(""), eq("criteria"), anyString(), eq(id), eq("group"));
    }
    @Test void noOpDoesNotAdvanceRevisionAndBoundsAreCheckedBeforeRedaction() {
        found(task("planned", "goal", "criteria"));
        assertEquals(3, service.update(id, update("group", 3, "planned", "goal", "criteria")).revision());
        assertThrows(IllegalArgumentException.class, () -> service.update(id, update("group", 3, null, "x".repeat(4001), null)));
        verify(jdbc, never()).update(anyString(), any(Object[].class));
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
