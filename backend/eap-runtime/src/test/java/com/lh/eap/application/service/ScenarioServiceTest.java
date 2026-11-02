package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lh.eap.application.dto.ScenarioConfiguration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

class ScenarioServiceTest {
    static ScenarioConfiguration definition(String name) {
        return new ScenarioConfiguration(name, "partial", List.of("code"), "summary", "instructions",
                List.of(), List.of(), List.of(), List.of(), null);
    }
    @Test void rejectsPresetIdsAndInvalidConfigurationBeforeStorage() {
        var jdbc = mock(JdbcTemplate.class);
        var service = new ScenarioService(jdbc);
        for (String id : List.of("prototype-to-code", "../custom-a", "custom-")) {
            assertThrows(ResponseStatusException.class, () -> service.save(id, new ScenarioConfiguration.Write(0L, definition("name"))));
        }
        assertThrows(ResponseStatusException.class, () -> service.save("custom-test", new ScenarioConfiguration.Write(0L, definition(" "))));
        assertThrows(ResponseStatusException.class, () -> service.save("custom-test", new ScenarioConfiguration.Write(-1L, definition("name"))));
        verifyNoInteractions(jdbc);
    }
    @Test void staleWriteAndDeleteNeverBecomeUnconditionalUpdates() {
        var jdbc = mock(JdbcTemplate.class);
        var service = new ScenarioService(jdbc);
        when(jdbc.queryForList(anyString(), org.mockito.ArgumentMatchers.<Object[]>any())).thenReturn(List.of());
        var error = assertThrows(ResponseStatusException.class, () -> service.save("custom-test", new ScenarioConfiguration.Write(2L, definition("name"))));
        assertEquals("SCENARIO_STALE", error.getReason());
        when(jdbc.update(anyString(), org.mockito.ArgumentMatchers.<Object[]>any())).thenReturn(0);
        assertEquals("SCENARIO_STALE", assertThrows(ResponseStatusException.class, () -> service.delete("custom-test", 2)).getReason());
    }
    @Test void databaseFailureIsNotAnEmptyCatalog() {
        var jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForList(anyString())).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("private database address"));
        var error = assertThrows(ResponseStatusException.class, () -> new ScenarioService(jdbc).list());
        assertEquals("SCENARIO_STORE_UNAVAILABLE", error.getReason());
        assertEquals(503, error.getStatusCode().value());
    }
}
