package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

class ContextBudgetTest {
    @Test void actualHistoryCountsTowardPlatformBudgetWithoutCountingAsCurrentMaterial() {
        var within = ContextBudget.account().include("system", "sys").include("user", "ask")
                .includeChars("history", 100).enforce();
        assertEquals(106, within.usedChars());
        assertEquals(3, within.materialChars());
        assertEquals(ContextBudget.METERING_CHAR_ESTIMATE, within.metering());
        assertThrows(ResponseStatusException.class, () -> ContextBudget.account()
                .include("user", "ask").includeChars("history", ContextBudget.PLATFORM_CONTEXT_CHARS).enforce());
        assertThrows(ResponseStatusException.class, () -> ContextBudget.account()
                .include("user", "ask").includeChars("history", Integer.MAX_VALUE).enforce());
    }

    @Test
    void acceptsWithinBudgetAndReportsCharEstimate() {
        var observation = ContextBudget.account()
                .include("system", "role")
                .include("user", "hello")
                .detail("files", 100)
                .unknown("history", "CHAT_MEMORY_NOT_METERED")
                .note("DERIVED_CLEARED_BEFORE_SEND")
                .enforce();
        assertEquals(ContextBudget.METERING_UNKNOWN, observation.metering());
        assertEquals(4 + 5, observation.usedChars());
        assertEquals(5, observation.materialChars());
        assertTrue(observation.remainingChars() > 0);
        assertTrue(observation.notes().contains("DERIVED_CLEARED_BEFORE_SEND"));
        assertTrue(observation.notes().contains("COMPRESSION_NOT_ENABLED"));
        assertEquals("CHAT_MEMORY_NOT_METERED",
                observation.sources().stream().filter(s -> s.source().equals("history")).findFirst().orElseThrow().disposition());
        assertEquals(100, observation.sources().stream().filter(s -> s.source().equals("files")).findFirst().orElseThrow().chars());
    }

    @Test
    void rejectsOversizedMaterialWithSourceBreakdown() {
        String material = "m".repeat(ContextBudget.INPUT_MATERIAL_LIMIT + 1);
        var rejected = assertThrows(ResponseStatusException.class, () -> ContextBudget.account()
                .include("system", "sys")
                .include("user", material)
                .detail("files", ContextBudget.INPUT_MATERIAL_LIMIT)
                .enforce());
        assertEquals("CONTEXT_BUDGET_EXCEEDED", rejected.getReason());
        Object budget = rejected.getBody().getProperties().get("contextBudget");
        assertInstanceOf(ContextBudget.Observation.class, budget);
        var observation = (ContextBudget.Observation) budget;
        assertEquals(ContextBudget.INPUT_MATERIAL_LIMIT + 1, observation.materialChars());
        assertTrue(observation.sources().stream().anyMatch(s -> s.source().equals("files") && s.disposition().equals("detail")));
    }

    @Test
    void droppedDerivedSourcesDoNotCountTowardUsed() {
        var observation = ContextBudget.account()
                .include("system", "sys")
                .include("user", "ask")
                .dropped("knowledge", 5000, "DERIVED_INVALIDATED")
                .dropped("skill", 3000, "DERIVED_INVALIDATED")
                .enforce();
        assertEquals(3 + 3, observation.usedChars());
        assertEquals(8000, observation.sources().stream()
                .filter(s -> s.disposition().equals("DERIVED_INVALIDATED"))
                .mapToInt(ContextBudget.SourceUsage::chars)
                .sum());
        assertEquals(2, observation.sources().stream().filter(s -> s.disposition().equals("DERIVED_INVALIDATED")).count());
    }

    @Test
    void platformLimitIncludesOutputReserve() {
        int system = 20000;
        int material = ContextBudget.PLATFORM_CONTEXT_CHARS - ContextBudget.OUTPUT_RESERVE_CHARS - system + 1;
        assertTrue(material < ContextBudget.INPUT_MATERIAL_LIMIT);
        var rejected = assertThrows(ResponseStatusException.class, () -> ContextBudget.account()
                .include("system", "s".repeat(system))
                .include("user", "u".repeat(material))
                .enforce());
        assertEquals("CONTEXT_BUDGET_EXCEEDED", rejected.getReason());
        var observation = (ContextBudget.Observation) rejected.getBody().getProperties().get("contextBudget");
        assertTrue(observation.usedChars() + observation.outputReserve() > observation.platformLimit());
    }

    @Test
    void observationOmitsSensitiveBodyText() {
        var observation = ContextBudget.account()
                .include("system", "SECRET_TOKEN=abc")
                .include("user", "password=hunter2")
                .enforce();
        String rendered = observation.toString();
        assertFalse(rendered.contains("SECRET_TOKEN=abc"));
        assertFalse(rendered.contains("password=hunter2"));
        assertTrue(rendered.contains("system"));
        assertTrue(rendered.contains("user"));
    }
}
