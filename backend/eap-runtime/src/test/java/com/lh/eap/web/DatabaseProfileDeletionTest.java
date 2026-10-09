package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

/**
 * A database profile is a snapshot other definitions point at, so removing one is a decision with a
 * boundary: it must be refused while an enabled expert still declares it, and it must report a missing
 * profile instead of quietly succeeding. These tests pin those three branches without a database.
 */
class DatabaseProfileDeletionTest {

    /** Stubs the reference query; the delete returns {@code deleteCount} rows. */
    private static JdbcTemplate jdbc(List<Map<String, Object>> references, int deleteCount) {
        var jdbc = mock(JdbcTemplate.class);
        // 引用检查是 queryForList(sql, id)：第二个参数是变参元素，不是单参重载。
        when(jdbc.queryForList(anyString(), anyString())).thenReturn(references);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(deleteCount);
        return jdbc;
    }

    private static Map<String, Object> expert(String id) {
        var row = new LinkedHashMap<String, Object>();
        row.put("id", id);
        return row;
    }

    @Test void deletingAProfileAnEnabledExpertUsesIsRefusedAndDeletesNothing() {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), anyString())).thenReturn(List.of(expert("orders-sql")));
        // If the code ever reaches the delete, the test fails loudly instead of silently passing.
        when(jdbc.update(anyString(), any(Object[].class)))
                .thenThrow(new AssertionError("资料被已启用专家引用时不得执行删除"));

        var error = assertThrows(ResponseStatusException.class,
                () -> new DatabaseInfoController(jdbc).remove(UUID.randomUUID()));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertTrue(error.getReason().contains("orders-sql"), error.getReason());
        assertTrue(error.getReason().contains("已启用的专家"), error.getReason());
    }

    @Test void theReferenceCheckOnlyCountsEnabledExpertsAndThenDeletes() {
        var queries = new ArrayList<String>();
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), anyString())).thenAnswer(invocation -> {
            queries.add(invocation.getArgument(0));
            return List.of();
        });
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        assertDoesNotThrow(() -> new DatabaseInfoController(jdbc).remove(UUID.randomUUID()));

        // 草稿引用不授予任何读取权，因此判定条件必须收在 enabled 上。
        assertEquals(1, queries.size(), "引用检查应只执行一次");
        assertTrue(queries.getFirst().contains("WHERE enabled"), queries.getFirst());
        assertTrue(queries.getFirst().contains("'databaseProfiles'"), queries.getFirst());
    }

    @Test void deletingAProfileThatDoesNotExistReportsNotFound() {
        var jdbc = jdbc(List.of(), 0);

        var error = assertThrows(ResponseStatusException.class,
                () -> new DatabaseInfoController(jdbc).remove(UUID.randomUUID()));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
        assertEquals("数据库资料不存在", error.getReason());
    }

    @Test void deletingAnUnreferencedProfileRemovesItAndEchoesTheId() {
        var sql = new ArrayList<String>();
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString(), anyString())).thenReturn(List.of());
        when(jdbc.update(anyString(), any(Object[].class))).thenAnswer(invocation -> {
            sql.add(invocation.getArgument(0));
            return 1;
        });
        var id = UUID.randomUUID();

        var result = new DatabaseInfoController(jdbc).remove(id);

        assertEquals(id, result.get("id"));
        assertEquals("deleted", result.get("status"));
        assertEquals(1, sql.size(), "只应执行一条删除语句");
        assertTrue(sql.getFirst().contains("DELETE FROM eap.database_profile"), sql.getFirst());
    }
}
