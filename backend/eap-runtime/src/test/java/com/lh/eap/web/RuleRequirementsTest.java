package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePacks;
import java.util.*;
import org.junit.jupiter.api.Test;

/**
 * The rule pack ↔ capability contract.
 *
 * <p>A rule reads facts. Every fact is produced by exactly one capability. So a pack that reads
 * {@code plan.seqScan} can only work when {@code database.explain} ran — and if nobody says so, the
 * rule quietly never fires and the report looks clean. These tests pin the three places where that is
 * caught: the pack declaration, the expert graph, and the run itself.
 */
class RuleRequirementsTest {

    private static RulePack.Condition fact(String key) {
        return new RulePack.Condition(key, "eq", true, null, null, null);
    }

    private static RulePack pack(RulePack.Requires requires, RulePack.Rule... rules) {
        return new RulePack("eap/v1", "RulePack", "test-pack", "Test pack", 1, null, null, List.of(rules), requires);
    }

    private static RulePack.Rule rule(String id, RulePack.Condition when) {
        return new RulePack.Rule(id, id, "测试", "medium", when, null, "证据", "建议", null);
    }

    @Test void packWithoutADeclarationIsRejectedAndToldWhatItNeeds() {
        var errors = RulePacks.validate(pack(null, rule("r.table", fact("select.noWhere"))));
        assertTrue(errors.stream().anyMatch(error -> error.contains("requires.capabilities")),
                "缺少能力声明的规则包必须被拒绝：" + errors);
        assertTrue(errors.stream().anyMatch(error -> error.contains("sql.parse")),
                "错误信息必须直接给出推导出的所需能力：" + errors);
    }

    @Test void declarationMustCoverTheCapabilitiesTheRulesActuallyNeed() {
        var declared = new RulePack.Requires(List.of("sql.parse"), null);
        var errors = RulePacks.validate(pack(declared, rule("r.plan", fact("plan.seqScan"))));
        assertTrue(errors.stream().anyMatch(error -> error.contains("database.explain")),
                "声明缺少规则实际依赖的能力时必须报错，否则该规则永远不会命中：" + errors);
    }

    @Test void declaringACapabilityThatPublishesNoFactsIsRejected() {
        var declared = new RulePack.Requires(List.of("sql.parse", "rg-search"), null);
        var errors = RulePacks.validate(pack(declared, rule("r.table", fact("select.noWhere"))));
        assertTrue(errors.stream().anyMatch(error -> error.contains("rg-search") && error.contains("不发布事实")),
                "规则包只能依赖发布事实的能力：" + errors);
    }

    @Test void shippedPacksDeclareExactlyWhatTheirRulesNeed() {
        for (var shipped : RulePacks.builtin()) {
            assertEquals(List.of(), RulePacks.validate(shipped), "内置规则包必须自洽：" + shipped.id());
            assertEquals(RulePacks.referencedFacts(shipped).stream()
                            .map(fact -> com.lh.eap.rules.SqlFactVocabulary.FACTS_BY_KEY.get(fact).producedBy())
                            .distinct().sorted().toList(),
                    RulePacks.requiredCapabilities(shipped).stream().sorted().toList(),
                    "内置规则包声明的能力必须正好等于它的事实来源：" + shipped.id());
        }
    }

    @Test void snapshotPackRequiresEveryCapabilityItReadsFrom() {
        var pack = RulePacks.builtinById("sql-snapshot-evidence").orElseThrow();
        assertEquals(Set.of("sql.parse", "database.schema.read", "database.index.read", "database.explain"),
                RulePacks.requiredCapabilities(pack),
                "跨能力规则包必须同时声明全部事实来源，否则专家编排无法校验");
    }

    private static ExpertManifest manifestOf(List<String> steps) {
        var nodes = new ArrayList<ExpertManifest.Step>();
        for (var capability : steps) nodes.add(new ExpertManifest.Step(capability, capability, capability, true));
        var edges = new ArrayList<ExpertManifest.Edge>();
        for (int index = 1; index < nodes.size(); index++) {
            edges.add(new ExpertManifest.Edge(nodes.get(index - 1).id(), nodes.get(index).id()));
        }
        return new ExpertManifest("eap/v1", "Expert", "test", "Test", List.of(), List.of(),
                List.copyOf(nodes), List.copyOf(edges),
                List.of("database.credentials.never-expose"), List.of("sql-snapshot-evidence"));
    }

    @Test void expertReferencingAPackWithoutItsCapabilitiesIsRejected() {
        var requirements = Map.of("sql-snapshot-evidence",
                RulePacks.requiredCapabilities(RulePacks.builtinById("sql-snapshot-evidence").orElseThrow()));
        var errors = ExpertGraph.validate(manifestOf(List.of("sql.parse", "knowledge.search")),
                ExpertGraph.CAPABILITIES, requirements);
        assertTrue(errors.stream().anyMatch(error -> error.contains("database.explain")
                        && error.contains("永远不会命中")),
                "引用规则包却缺少对应能力节点，必须在保存/启用时被拒绝：" + errors);
    }

    @Test void expertWithEveryRequiredNodePasses() {
        var requirements = Map.of("sql-snapshot-evidence",
                RulePacks.requiredCapabilities(RulePacks.builtinById("sql-snapshot-evidence").orElseThrow()));
        assertEquals(List.of(), ExpertGraph.validate(manifestOf(List.of("sql.parse",
                "database.schema.read", "database.index.read", "database.explain")),
                ExpertGraph.CAPABILITIES, requirements));
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> factsOf(String sql) {
        var analysis = DeterministicSqlAnalyzer.extract(sql);
        return (Map<String, Object>) analysis.get("facts");
    }

    @Test void rulesWhoseFactsHadNoProducerAreReportedAsBlockedRatherThanClean() {
        var pack = RulePacks.builtinById("sql-snapshot-evidence").orElseThrow();
        var analysis = DeterministicSqlAnalyzer.extract("select id from users limit 10");
        var judged = DeterministicSqlAnalyzer.judge(analysis, List.of(pack), Set.of("sql.parse"));

        assertEquals(List.of(), judged.get("findings"), "事实缺失时不能凭空产生发现");
        var blocked = (List<Map<String, Object>>) judged.get("blockedRules");
        assertEquals(pack.rules().size(), blocked.size(), "所有依赖未执行能力的规则都必须报为未判定");
        assertTrue(blocked.stream().allMatch(entry -> !((List<String>) entry.get("missingCapabilities")).isEmpty()));
        assertTrue(String.valueOf(judged.get("summary")).contains("未能判定"),
                "结论必须说明本次判定不完整：" + judged.get("summary"));
    }

    @Test void crossCapabilityRuleFiresOnlyWhenBothProducersRan() {
        var pack = RulePacks.builtinById("sql-snapshot-evidence").orElseThrow();
        var analysis = DeterministicSqlAnalyzer.extract("select id from users limit 10");
        var facts = (Map<String, Object>) analysis.get("facts");
        facts.put("plan.loaded", true);
        facts.put("plan.seqScan", true);
        facts.put("plan.filteredSeqScan", false);
        facts.put("plan.nodeTypes", "Seq Scan");
        facts.put("plan.nodeCount", 1);

        var partial = DeterministicSqlAnalyzer.judge(analysis, List.of(pack), Set.of("sql.parse"));
        assertFalse(((List<String>) partial.get("rulesFired")).contains("plan.scan_with_unstable_pagination"));

        var complete = DeterministicSqlAnalyzer.judge(analysis, List.of(pack),
                Set.of("sql.parse", "database.explain", "database.schema.read", "database.index.read"));
        assertTrue(((List<String>) complete.get("rulesFired")).contains("plan.scan_with_unstable_pagination"),
                "SQL 结构与计划事实都具备时，跨能力规则必须命中：" + complete.get("rulesFired"));
        assertTrue(List.of("plan.seq_scan", "plan.scan_with_unstable_pagination")
                .containsAll((List<String>) complete.get("rulesFired")));
    }
}
