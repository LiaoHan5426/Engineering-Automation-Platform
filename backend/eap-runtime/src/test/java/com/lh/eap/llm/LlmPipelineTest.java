package com.lh.eap.llm;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.decision.DecisionProvider;
import com.lh.eap.decision.RuleBasedDecisionProvider;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class LlmPipelineTest {
    @Test void sqlCompatibilityBridgeUsesSpringAiModelAndOptions(){
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        var model = com.lh.eap.ai.FakeChatModels.scripted(prompt -> {
            calls.incrementAndGet();
            assertEquals("offline-model", prompt.getOptions().getModel());
            assertEquals(128, prompt.getOptions().getMaxTokens());
            assertTrue(prompt.getContents().contains("system instruction"));
            return com.lh.eap.ai.FakeChatModels.text("model observation");
        });
        var bridge = com.lh.eap.ai.FakeChatModels.sqlBridge(model);
        assertTrue(bridge.available());
        var result = bridge.complete(new LlmProvider.Request("system instruction", "question", 0.1, 128, null));
        assertTrue(result.ok()); assertEquals("model observation", result.text());
        assertEquals("offline-model", result.model()); assertEquals(1, calls.get());
    }

    @Test void preprocessingCompressesRequestAgainstNaiveBaseline(){
        var analysis=Map.<String,Object>of(
                "parseStatus","valid",
                "findings",List.of(
                        Map.of("code","projection.select_star","severity","medium","evidence","投影中包含 * 通配符。"),
                        Map.of("code","predicate.function_on_column","severity","high","evidence","函数包裹了列：UPPER。")),
                "joinKeys",List.of("o.customer_id = c.id"),
                "deterministicConfidence",0.85,
                "requiresModelReview",false);
        var evidence=new PromptPreprocessor.SqlEvidence(
                "select * from orders o join customer c on o.customer_id=c.id where upper(c.name)=:n",
                "为什么这个查询慢",
                analysis,
                List.of(Map.of("knowledgeBase","dba","source","index-guide.md","excerpt","x".repeat(3000))),
                List.of("customer.name 有索引"),List.of("不得自动执行 SQL"));
        var prompt=new PromptPreprocessor(600).prepare(evidence);
        assertTrue(prompt.compressionRatio()>0, "prepared prompt should be smaller than the naive baseline");
        assertTrue(prompt.estimatedTokens()<=600+120, "prompt must respect the configured budget");
        assertTrue(prompt.userPrompt().contains("Deterministic findings"));
        assertTrue(prompt.userPrompt().contains("projection.select_star"));
    }

    @Test void gatewayFailsClosedWithoutProviders(){
        var gateway=new LlmGateway(List.of(),8);
        assertFalse(gateway.available());
        assertTrue(gateway.complete(new LlmProvider.Request("s","u",0.1,100,null)).isEmpty());
    }

    @Test void decisionSkipsWhenDeterministicIsDecisiveAndEnhancesWhenRequested(){
        var provider=new RuleBasedDecisionProvider();
        var skip=provider.decide(new DecisionProvider.Request("sql.enhance",Map.of(
                "parseStatus","valid","requiresModelReview",false,"deterministicConfidence",0.85,"userRequested",false)));
        assertTrue(skip.is("skip"));
        var enhance=provider.decide(new DecisionProvider.Request("sql.enhance",Map.of(
                "parseStatus","valid","requiresModelReview",false,"deterministicConfidence",0.85,"userRequested",true)));
        assertTrue(enhance.is("enhance"));
        var blocked=provider.decide(new DecisionProvider.Request("sql.enhance",Map.of("parseStatus","invalid")));
        assertTrue(blocked.is("skip"));
    }
}
