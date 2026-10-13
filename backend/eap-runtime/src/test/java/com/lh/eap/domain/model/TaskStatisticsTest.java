package com.lh.eap.domain.model;

import static org.junit.jupiter.api.Assertions.*;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The overview's figures are only worth showing if a reader can tell what they are computed from, and if
 * "no data yet" is not silently rendered as a confident {@code 0%}.
 */
class TaskStatisticsTest {

    private static TaskStatistics statistics(long recorded, long modelCalls) {
        var byStatus = new LinkedHashMap<String, Long>();
        byStatus.put("completed", 4L);
        var byDecision = new LinkedHashMap<String, Long>();
        byDecision.put("accepted", 4L);
        return new TaskStatistics(7, 12, 9, 31, recorded, modelCalls, byStatus, byDecision);
    }

    @Test void sharesAreComputedFromRecordedRunsOnly() {
        var share = statistics(4, 1);
        assertEquals(0.25d, share.modelShare().doubleValue());
        assertEquals(0.75d, share.deterministicShare().doubleValue());
    }

    @Test void noRecordedRunsMeansNoRatioRatherThanZeroPercent() {
        var empty = statistics(0, 0);
        assertNull(empty.modelShare(), "还没有任何记录了模型走向的执行时，占比必须为 null 而不是 0");
        assertNull(empty.deterministicShare());
        assertNull(empty.toMap().get("deterministicShare"));
    }

    @Test void everyFigureCarriesItsSourceAndWindow() {
        var map = statistics(4, 0).toMap();
        assertEquals(7, map.get("windowDays"));
        assertEquals(12L, map.get("tasksTotal"));
        assertEquals(9L, map.get("tasksInWindow"));
        assertEquals(31L, map.get("observationsInWindow"));
        assertEquals("eap.task · eap.task_observation", map.get("source"));
        assertTrue(String.valueOf(map.get("note")).contains("近 7 日"));
        var model = (Map<?, ?>) map.get("model");
        assertEquals(4L, model.get("recordedRuns"));
        assertEquals(0L, model.get("calls"));
        assertEquals(0.0d, ((Number) model.get("share")).doubleValue());
    }

    @Test void aRunThatNeverReachedJudgementIsNotCountedAsDeterministic() {
        // 3 planner runs + 1 that recorded a model call: the ratio must read 1/1, not 1/4.
        var mixed = new TaskStatistics(7, 4, 4, 3, 1, 1, Map.of(), Map.of());
        assertEquals(1.0d, mixed.modelShare().doubleValue());
        assertEquals(0.0d, mixed.deterministicShare().doubleValue());
    }
}
