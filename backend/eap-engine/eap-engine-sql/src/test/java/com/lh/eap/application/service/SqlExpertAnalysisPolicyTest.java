package com.lh.eap.application.service;

import com.lh.eap.core.ExpertAnalysisPolicy;
import com.lh.eap.rules.RulePackService;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SqlExpertAnalysisPolicyTest {
    private ExpertAnalysisPolicy.Evidence evidence(String parseStatus) {
        return new ExpertAnalysisPolicy.Evidence("select 1", "inspect", Map.of("parseStatus", parseStatus), List.of(), List.of());
    }
    @Test void failedOrInvalidDeterministicRunsNeverReachTheModel() {
        var model = mock(SqlExpertService.class);
        var policy = new SqlExpertAnalysisPolicy(mock(RulePackService.class), model);
        assertEquals("unavailable", policy.enhance(evidence("valid"), true, true).state());
        assertEquals("unavailable", policy.enhance(evidence("invalid"), false, true).state());
        verifyNoInteractions(model);
    }
    @Test void successfulModelOutputRemainsAnUnverifiedObservation() {
        var model = mock(SqlExpertService.class); var outcome = mock(SqlExpertService.Outcome.class);
        when(model.advise(any(), eq(true))).thenReturn(outcome);
        when(outcome.succeeded()).thenReturn(true); when(outcome.text()).thenReturn("candidate advice");
        var result = new SqlExpertAnalysisPolicy(mock(RulePackService.class), model).enhance(evidence("valid"), false, true);
        assertEquals("unverified-observation", result.state()); assertEquals("candidate advice", result.advice());
        assertEquals(true, result.advisor().get("succeeded"));
    }
    @Test void skippedAndUnavailableModelsRemainDistinct() {
        var model = mock(SqlExpertService.class); var outcome = mock(SqlExpertService.Outcome.class);
        when(model.advise(any(), eq(false))).thenReturn(outcome); when(outcome.error()).thenReturn("");
        var policy = new SqlExpertAnalysisPolicy(mock(RulePackService.class), model);
        assertEquals("skipped", policy.enhance(evidence("valid"), false, false).state());
        when(outcome.error()).thenReturn("AI_NOT_CONFIGURED");
        var result = policy.enhance(evidence("valid"), false, false);
        assertEquals("unavailable", result.state()); assertNull(result.advice());
    }
}
