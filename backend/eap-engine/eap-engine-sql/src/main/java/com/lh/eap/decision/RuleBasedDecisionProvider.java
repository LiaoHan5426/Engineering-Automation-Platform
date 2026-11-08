package com.lh.eap.decision;

import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Default deterministic decision policy.
 *
 * <p>It implements the platform's cost rule: a model is consulted only when it is genuinely needed.
 * The model is skipped when the SQL failed to parse or when the deterministic findings are already
 * decisive; it is requested when the operator explicitly asked for it or when structural complexity
 * leaves the deterministic confidence too low to act on.
 */
@Component
public class RuleBasedDecisionProvider implements DecisionProvider {
    public static final String KIND_SQL_ENHANCE = "sql.enhance";
    public static final String CHOICE_ENHANCE = "enhance";
    public static final String CHOICE_SKIP = "skip";

    @Override
    public Decision decide(Request request) {
        if (!KIND_SQL_ENHANCE.equals(request.kind())) {
            return new Decision(CHOICE_SKIP, 1.0, "未知决策类型，按确定性路径处理");
        }
        Map<String, Object> features = request.features() == null ? Map.of() : request.features();
        var parseStatus = String.valueOf(features.getOrDefault("parseStatus", "invalid"));
        boolean userRequested = Boolean.TRUE.equals(features.get("userRequested"));
        boolean requiresReview = Boolean.TRUE.equals(features.get("requiresModelReview"));
        double confidence = number(features.get("deterministicConfidence"), 0.5);

        if (!"valid".equals(parseStatus)) {
            return new Decision(CHOICE_SKIP, 1.0, "SQL 未通过确定性解析，模型复核无意义，已跳过");
        }
        if (userRequested) {
            return new Decision(CHOICE_ENHANCE, 0.9, "操作者显式请求模型增强");
        }
        if (requiresReview) {
            return new Decision(CHOICE_ENHANCE, 0.7,
                    "确定性置信度较低（" + confidence + "）且结构复杂，建议基于压缩证据复核");
        }
        return new Decision(CHOICE_SKIP, confidence,
                "确定性证据已足以给出可执行建议（置信度 " + confidence + "），跳过模型以节省消耗");
    }

    private static double number(Object value, double fallback) {
        return value instanceof Number number ? number.doubleValue() : fallback;
    }
}
