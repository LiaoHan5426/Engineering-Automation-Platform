package com.lh.eap.application.service;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import java.util.List;
import java.util.UUID;

class BoardTaskServiceTest {
    @Test @SuppressWarnings("unchecked") void createsInRequestedBacklogLaneAndRefusesInitialExecution() {
        var jdbc = mock(JdbcTemplate.class);
        var task = new BoardTaskService.Task(UUID.randomUUID(), "group", "ready draft", "ready", "", "", 1, List.of("created"), "none");
        when(jdbc.query(anyString(), any(RowMapper.class), any(UUID.class))).thenReturn(List.of(task));
        var service = new BoardTaskService(jdbc);
        assertEquals("ready", service.create(new BoardTaskService.Draft("group", "ready draft", "", "ready")).column());
        verify(jdbc).update(eq("INSERT INTO eap.board_task(id,project_id,title,session_id,column_id) VALUES (?,?,?,?,?)"), any(UUID.class), eq("group"), eq("ready draft"), eq(""), eq("ready"));
        assertThrows(IllegalArgumentException.class, () -> service.create(new BoardTaskService.Draft("group", "invalid", "", "running")));
    }
    @Test @SuppressWarnings("unchecked") void persistsOptionalSessionIdWithoutStartingExecution() {
        var jdbc = mock(JdbcTemplate.class);
        var task = new BoardTaskService.Task(UUID.randomUUID(), "group", "linked", "planned", "", "conv-42", 1, List.of("created"), "none");
        when(jdbc.query(anyString(), any(RowMapper.class), any(UUID.class))).thenReturn(List.of(task));
        var service = new BoardTaskService(jdbc);
        assertEquals("conv-42", service.create(new BoardTaskService.Draft("group", "linked", "conv-42", "planned")).sessionId());
        verify(jdbc).update(eq("INSERT INTO eap.board_task(id,project_id,title,session_id,column_id) VALUES (?,?,?,?,?)"), any(UUID.class), eq("group"), eq("linked"), eq("conv-42"), eq("planned"));
        assertThrows(IllegalArgumentException.class, () -> service.create(new BoardTaskService.Draft("group", "too-long", "x".repeat(121), "planned")));
    }
    @Test void validatesPriorityWithoutInventingAdditionalRanks() {
        for (var value : java.util.List.of("none", "p0", "p1", "p2")) assertEquals(value, BoardTaskService.validatePriority(value));
        assertThrows(IllegalArgumentException.class, () -> BoardTaskService.validatePriority("urgent"));
        assertThrows(IllegalArgumentException.class, () -> BoardTaskService.validatePriority(null));
    }
    @Test void allowsBacklogEditsButNeverInventsExecutionOrAcceptance() {
        assertTrue(BoardTaskService.allowed("planned", "ready"));
        assertTrue(BoardTaskService.allowed("ready", "planned"));
        assertTrue(BoardTaskService.allowed("planned", "planned"));
        assertFalse(BoardTaskService.allowed("ready", "running"));
        assertFalse(BoardTaskService.allowed("planned", "done"));
        assertFalse(BoardTaskService.allowed("acceptance", "done"));
        assertFalse(BoardTaskService.allowed("planned", "invalid"));
    }
}
