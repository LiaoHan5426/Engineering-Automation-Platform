package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static com.lh.eap.ai.FakeChatModels.*;
import com.lh.eap.decision.RuleBasedDecisionProvider;
import com.lh.eap.llm.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;

class SqlExpertServiceTest {
    private SqlExpertService service(ChatModel model) {
        return new SqlExpertService(new PromptPreprocessor(600),
                new LlmGateway(List.of(sqlBridge(model)), 8), new RuleBasedDecisionProvider(), 0.1, 128);
    }
    private PromptPreprocessor.SqlEvidence evidence(boolean review) {
        return new PromptPreprocessor.SqlEvidence("select * from users", "explain",
                Map.of("parseStatus", "valid", "requiresModelReview", review,
                        "deterministicConfidence", review ? 0.3 : 0.99,
                        "findings", List.of(Map.of("code", "projection.select_star"))),
                List.of(), List.of(), List.of("Never execute SQL"));
    }
    @Test void deterministicDecisionNeverCallsModelWhenEvidenceIsDecisive() {
        var calls = new AtomicInteger();
        var result = service(scripted(p -> { calls.incrementAndGet(); return text("not expected"); })).advise(evidence(false), false);
        assertFalse(result.attempted()); assertEquals("skip", result.decision()); assertEquals(0, calls.get());
    }
    @Test void lowConfidenceAndExplicitRequestReachSpringAiAndCacheSuccessfulObservation() {
        var calls = new AtomicInteger();
        var service = service(scripted(p -> {
            calls.incrementAndGet();
            assertTrue(p.getContents().contains("projection.select_star"));
            return text("Offline model observation; requires verification");
        }));
        var evidence = evidence(true);
        var first = service.advise(evidence, false); var second = service.advise(evidence, true);
        assertTrue(first.attempted()); assertTrue(first.succeeded()); assertTrue(second.succeeded());
        assertEquals(1, calls.get()); assertEquals("offline-model", first.model());
        assertEquals("Offline model observation; requires verification", first.text());
        assertEquals("", first.error()); assertEquals("", SqlExpertService.toResponse(first).get("error"));
        assertEquals("valid", evidence.analysis().get("parseStatus"));
    }
    @Test void missingModelFallsBackAndReportsNotConfigured() {
        var result = service(null).advise(evidence(true), true);
        assertFalse(result.attempted()); assertFalse(result.succeeded()); assertNull(result.text());
        assertEquals("AI_NOT_CONFIGURED", result.error());
    }
    @Test void failedModelIsNotCachedAndCanRecoverWithoutChangingDeterministicEvidence() {
        var calls = new AtomicInteger(); var input = evidence(true);
        var service = service(scripted(p -> {
            if (calls.getAndIncrement() == 0) throw new RuntimeException("secret=do-not-leak");
            return text("Recovered model observation");
        }));
        var failed = service.advise(input, true);
        assertTrue(failed.attempted()); assertFalse(failed.succeeded()); assertNull(failed.text());
        assertEquals("AI_PROVIDER_ERROR", failed.error());
        assertFalse(SqlExpertService.toResponse(failed).toString().contains("do-not-leak"));
        assertTrue(service.advise(input, true).succeeded()); assertEquals(2, calls.get());
        assertEquals("valid", input.analysis().get("parseStatus"));
    }
    @Test void cacheDoesNotConfuseTokenBudgetsOrExplicitCacheLabels() {
        var calls = new AtomicInteger();
        var gateway = new LlmGateway(List.of(sqlBridge(scripted(p -> text("response " + calls.incrementAndGet())))), 8);
        var first = new LlmProvider.Request("s", "one", 0.1, 100, "shared-label");
        assertEquals(gateway.complete(first), gateway.complete(first));
        gateway.complete(new LlmProvider.Request("s", "two", 0.1, 100, "shared-label"));
        gateway.complete(new LlmProvider.Request("s", "one", 0.1, 200, "shared-label"));
        assertEquals(3, calls.get());
    }
    @Test void emptyModelResponseFallsBackWithExplicitError() {
        var result = service(scripted(p -> text(""))).advise(evidence(true), true);
        assertFalse(result.succeeded()); assertEquals("AI_EMPTY_RESPONSE", result.error());
    }
}
