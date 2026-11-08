package com.lh.eap.application.service;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class JdbcCliChannelStoreTest {
    @Test void successfulEmptyReadAllowsShippedDefaults() {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString())).thenReturn(List.of());
        assertEquals("git", new CliChannels(new JdbcCliChannelStore(jdbc)).binaryFor("git-status", "git"));
    }
    @Test void storageFailuresAreRedactedAndRejectFallback() {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString())).thenThrow(new IllegalStateException("driver secret=private"));
        var channels = new CliChannels(new JdbcCliChannelStore(jdbc));
        var error = assertThrows(ResponseStatusException.class, () -> channels.binaryFor("git-status", "git"));
        assertEquals(503, error.getStatusCode().value());
        assertEquals("CLI_CHANNEL_STORE_UNAVAILABLE", error.getReason());
        assertNull(error.getCause());
    }
    @Test void missingOrMalformedAuthoritativeRowsAreNotTreatedAsEmpty() {
        var jdbc = mock(JdbcTemplate.class);
        var store = new JdbcCliChannelStore(jdbc);
        when(jdbc.queryForList(anyString())).thenReturn(null);
        assertThrows(ResponseStatusException.class, store::overrides);
        when(jdbc.queryForList(anyString())).thenReturn(List.of(Map.of("capability", "git", "binary_path", " ")));
        assertThrows(ResponseStatusException.class, store::overrides);
    }
}
