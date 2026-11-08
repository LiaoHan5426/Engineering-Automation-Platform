package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.lh.eap.persistence.mapper.DatabaseProfileMapper;
import com.lh.eap.web.controller.DatabaseInfoController;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * A database profile is a snapshot other definitions point at, so removing one is a decision with a
 * boundary: it must be refused while an enabled expert still declares it, and it must report a missing
 * profile instead of quietly succeeding. These tests pin those three branches without a database.
 */
class DatabaseProfileDeletionTest {

    private static Map<String, Object> expert(String id) {
        var row = new LinkedHashMap<String, Object>();
        row.put("id", id);
        return row;
    }

    private static DatabaseInfoController controller(DatabaseProfileMapper mapper) {
        return new DatabaseInfoController(new DatabaseProfileService(mapper));
    }

    @Test void deletingAProfileAnEnabledExpertUsesIsRefusedAndDeletesNothing() {
        var mapper = mock(DatabaseProfileMapper.class);
        when(mapper.enabledReferences(any())).thenReturn(List.of(expert("orders-sql")));
        when(mapper.delete(any())).thenThrow(new AssertionError("资料被已启用专家引用时不得执行删除"));

        var error = assertThrows(ResponseStatusException.class,
                () -> controller(mapper).remove(UUID.randomUUID()));

        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        assertTrue(error.getReason().contains("orders-sql"), error.getReason());
        assertTrue(error.getReason().contains("已启用的专家"), error.getReason());
        verify(mapper, never()).delete(any());
    }

    @Test void theReferenceCheckOnlyCountsEnabledExpertsAndThenDeletes() {
        var mapper = mock(DatabaseProfileMapper.class);
        when(mapper.enabledReferences(any())).thenReturn(List.of());
        when(mapper.delete(any())).thenReturn(1);

        assertDoesNotThrow(() -> controller(mapper).remove(UUID.randomUUID()));

        verify(mapper).enabledReferences(any());
        verify(mapper).delete(any());
    }

    @Test void deletingAProfileThatDoesNotExistReportsNotFound() {
        var mapper = mock(DatabaseProfileMapper.class);
        when(mapper.enabledReferences(any())).thenReturn(List.of());
        when(mapper.delete(any())).thenReturn(0);

        var error = assertThrows(ResponseStatusException.class,
                () -> controller(mapper).remove(UUID.randomUUID()));

        assertEquals(HttpStatus.NOT_FOUND, error.getStatusCode());
        assertEquals("数据库资料不存在", error.getReason());
    }

    @Test void deletingAnUnreferencedProfileRemovesItAndEchoesTheId() {
        var mapper = mock(DatabaseProfileMapper.class);
        when(mapper.enabledReferences(any())).thenReturn(List.of());
        when(mapper.delete(any())).thenReturn(1);
        var id = UUID.randomUUID();

        var result = controller(mapper).remove(id);

        assertEquals(id, result.get("id"));
        assertEquals("deleted", result.get("status"));
        verify(mapper).delete(id);
    }
}
