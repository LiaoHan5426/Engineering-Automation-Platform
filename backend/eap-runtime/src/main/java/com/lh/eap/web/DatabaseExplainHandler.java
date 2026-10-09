package com.lh.eap.web;

import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.springframework.stereotype.Component;

/**
 * Interprets a user-supplied EXPLAIN snapshot.
 *
 * <p>The platform never runs the statement, so this is evidence, not a measurement. The handler
 * publishes plan facts so that a rule pack — not a Java branch — decides what a plan shape means.
 */
@Component
public class DatabaseExplainHandler implements CapabilityHandler {
    private static final String CAPABILITY = SqlFactVocabulary.DATABASE_EXPLAIN;

    @Override public Set<String> capabilities() { return Set.of(CAPABILITY); }

    @Override public CapabilityKind kind() { return CapabilityKind.COMMAND; }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor(CAPABILITY, kind(),
                "分析执行计划快照",
                "解析用户自行取得的 PostgreSQL EXPLAIN JSON，识别扫描与连接节点。平台不会执行 SQL，因此这是计划证据而非实测耗时。",
                List.of("explainPlan（用户粘贴的 EXPLAIN JSON）"),
                List.of(),
                "运行时内置解析（进程内，无外部依赖）",
                SqlFactVocabulary.factsOf(CAPABILITY).stream().map(SqlFactVocabulary.Fact::key).toList(),
                List.of("plan"),
                true));
    }

    @Override public NodeResult handle(CapabilityContext context) {
        var plan = context.request().explainPlan();
        if (plan == null) {
            context.publish("plan.loaded", false);
            return new NodeResult(false, true, "未提供 EXPLAIN JSON；平台不会自动执行 SQL", Map.of());
        }
        if (!hasPlanNode(plan)) {
            context.publish("plan.loaded", false);
            return new NodeResult(false, true, "计划没有有效的 Node Type，请提供 PostgreSQL EXPLAIN JSON", Map.of());
        }
        var advice = new ArrayList<String>();
        var types = new LinkedHashSet<String>();
        var counters = new int[2]; // 0 = node count, 1 = filtered sequential scans
        collectAdvice(plan, advice, types, counters);
        context.publish("plan.loaded", true);
        context.publish("plan.nodeCount", counters[0]);
        context.publish("plan.nodeTypes", String.join("、", types));
        context.publish("plan.seqScan", types.contains("Seq Scan"));
        context.publish("plan.filteredSeqScan", counters[1] > 0);
        context.advice().addAll(advice);
        return new NodeResult(true, false, "已分析用户提供的计划快照，不代表平台实测耗时",
                Map.of("plan", plan, "nodeTypes", List.copyOf(types)));
    }

    static void collectAdvice(Object value, List<String> advice, Set<String> types, int[] counters) {
        if (value instanceof Map<?, ?> map) {
            if (map.containsKey("Node Type")) {
                var node = String.valueOf(map.get("Node Type"));
                var relation = Objects.toString(map.get("Relation Name"), "未指定关系");
                types.add(node);
                counters[0]++;
                advice.add("计划节点 " + node + "（" + relation + "），估计行数："
                        + Objects.toString(map.get("Plan Rows"), "未提供") + "。这是计划证据，不是实际耗时。");
                if ("Seq Scan".equals(node) && map.get("Filter") != null) {
                    counters[1]++;
                    advice.add("该顺序扫描包含过滤：" + map.get("Filter")
                            + "；需结合选择性、现有索引与实际行数比较是否适合索引访问。");
                }
            }
            for (var child : map.values()) collectAdvice(child, advice, types, counters);
        } else if (value instanceof Iterable<?> list) {
            for (var child : list) collectAdvice(child, advice, types, counters);
        }
    }

    static boolean hasPlanNode(Object value) {
        if (value instanceof Map<?, ?> map) {
            if (map.get("Node Type") instanceof String type && !type.isBlank()) return true;
            return map.values().stream().anyMatch(DatabaseExplainHandler::hasPlanNode);
        }
        if (value instanceof List<?> list) return list.stream().anyMatch(DatabaseExplainHandler::hasPlanNode);
        return false;
    }
}
