package com.lh.eap.application.service;

import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.SqlParseHandler;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.BadSqlGrammarException;
import com.lh.eap.core.CapabilitySettingsStore;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CapabilitySettingsTest {
    private static CapabilitySettings settings(CapabilitySettingsStore store) {
        return new CapabilitySettings(store, null);
    }

    static Stream<RuntimeException> queryFailures() {
        return Stream.of(new DataAccessResourceFailureException("fixture connection unavailable"),
                new BadSqlGrammarException("fixture", "SELECT unavailable", new java.sql.SQLException("fixture schema missing")),
                new IllegalStateException("fixture query adapter failure"));
    }

    @ParameterizedTest
    @MethodSource("queryFailures")
    void queryFailureIsUnavailableRatherThanAnEmptyOptOutList(RuntimeException failure) {
        var store = mock(CapabilitySettingsStore.class);
        when(store.loadAll()).thenThrow(failure);
        var settings = settings(store);
        assertUnavailable(settings::all);
        assertUnavailable(() -> settings.setting("sql.parse"));
        assertUnavailable(() -> settings.enabled("sql.parse"));
        assertUnavailable(settings::disabled);
        var handlers = new CapabilityHandlerRegistry(List.of(new SqlParseHandler()), settings);
        assertTrue(handlers.find("sql.parse").isPresent());
        assertUnavailable(() -> handlers.resolveFor(null, "sql.parse"));
    }

    @Test
    void successfulEmptyQueryKeepsTheDocumentedDefaultOn() {
        var store = mock(CapabilitySettingsStore.class);
        when(store.loadAll()).thenReturn(List.of());
        var settings = settings(store);
        assertTrue(settings.all().isEmpty());
        assertTrue(settings.enabled("sql.parse"));
        assertTrue(settings.disabled().isEmpty());
        assertTrue(new CapabilityHandlerRegistry(List.of(new SqlParseHandler()), settings)
                .resolveFor(null, "sql.parse").isPresent());
    }

    @Test
    void storedSwitchesRemainAuthoritativeAndMissingRowsStillDefaultOn() {
        var store = mock(CapabilitySettingsStore.class);
        when(store.loadAll()).thenReturn(List.of(new CapabilitySettingsStore.Row("sql.parse", false, null, null),
                new CapabilitySettingsStore.Row("git-status", true, null, null)));
        var settings = settings(store);
        assertFalse(settings.enabled("sql.parse"));
        assertTrue(settings.enabled("git-status"));
        assertTrue(settings.enabled("git-diff"));
        assertEquals(java.util.Set.of("sql.parse"), settings.disabled());
    }

    @Test
    void absentDataSourceIsNotProofOfAnEmptySettingsTable() {
        assertUnavailable(() -> new CapabilitySettings(null, null).enabled("sql.parse"));
    }

    @Test
    void nullQueryResultIsNotProofOfAnEmptySettingsTable() {
        var store = mock(CapabilitySettingsStore.class);
        when(store.loadAll()).thenReturn(null);
        assertUnavailable(() -> settings(store).enabled("sql.parse"));
    }

    @Test
    void successfulReadDoesNotPermitAStaleAllowDuringAnOutage() {
        var store = mock(CapabilitySettingsStore.class);
        when(store.loadAll()).thenReturn(List.of())
                .thenThrow(new DataAccessResourceFailureException("fixture outage"))
                .thenReturn(List.of(new CapabilitySettingsStore.Row("sql.parse", false, null, null)));
        var settings = settings(store);
        assertTrue(settings.enabled("sql.parse"));
        assertUnavailable(() -> settings.enabled("sql.parse"));
        assertFalse(settings.enabled("sql.parse"));
    }

    private static void assertUnavailable(org.junit.jupiter.api.function.Executable action) {
        var error = assertThrows(ResponseStatusException.class, action);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, error.getStatusCode());
        assertEquals("CAPABILITY_SETTINGS_UNAVAILABLE", error.getReason());
        assertFalse(error.getMessage().contains("fixture"), "Do not publish database diagnostics in the API error");
    }
}
