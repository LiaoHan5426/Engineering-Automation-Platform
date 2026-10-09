package com.lh.eap.web;

import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePacks;
import com.lh.eap.rules.SqlFactExtractor;
import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Proves the central architectural claim: an expert's judgement is configuration, not code.
 *
 * <p>These tests are written against rule packs that exist only inside the test. Nothing in
 * {@code src/main/java} mentions their ids, severities or wording, yet they drive the findings.
 */
class ConfigDrivenExpertTest {

    private static RulePack packOf(RulePack.Rule... rules) {
        return new RulePack("eap/v1", "RulePack", "test-pack", "Test pack", 1, null, null, List.of(rules));
    }

    private static RulePack.Condition fact(String key, String op, Object value) {
        return new RulePack.Condition(key, op, value, null, null, null);
    }

    @Test void ruleAuthoredInConfigurationFiresWithoutAnyCodeSupport() {
        var pack = packOf(new RulePack.Rule(
                "custom.multi_table_scan", "多表扫描", "结构", "medium",
                fact("table.count", "gte", 2), null,
                "语句涉及 {{table.count}} 张表：{{table.list}}。",
                "确认连接顺序与过滤下推，必要时用执行计划比较连接方式。", null));

        var result = DeterministicSqlAnalyzer.analyze("select a.id from a join b on a.id = b.a_id", List.of(pack));

        assertTrue(((List<?>) result.get("rulesFired")).contains("custom.multi_table_scan"));
        var finding = ((List<Map<String, Object>>) result.get("findings")).getFirst();
        assertEquals("medium", finding.get("severity"));
        assertEquals("语句涉及 2 张表：a、b。", finding.get("evidence"), "证据文本可出现配置中的占位符");
    }

    @Test void severityAndWordingAreDataNotCode() {
        var condition = fact("predicate.or", "eq", true);
        var lenient = DeterministicSqlAnalyzer.analyze("select id from t where a=1 or b=2",
                List.of(packOf(new RulePack.Rule("r.lenient", "OR", "谓词", "low", condition, null,
                        "出现 OR。", "可评估改写为 UNION ALL。", null))));
        var strict = DeterministicSqlAnalyzer.analyze("select id from t where a=1 or b=2",
                List.of(packOf(new RulePack.Rule("r.strict", "OR", "谓词", "critical", condition, null,
                        "出现 OR，必须重写。", "立即改写为 UNION ALL 或拆分查询。", null))));

        assertEquals("low", severityOf(lenient, "r.lenient"));
        assertEquals("critical", severityOf(strict, "r.strict"));
        assertTrue(strict.get("summary").toString().contains("critical"));
    }

    @Test void shippedPackEscalatesSeverityFromFactsInsteadOfHardcodedBranches() {
        var single = DeterministicSqlAnalyzer.analyze("select * from orders");
        var joined = DeterministicSqlAnalyzer.analyze("select * from orders o join customer c on o.customer_id = c.id");
        assertEquals("low", severityOf(single, "projection.select_star"));
        assertEquals("medium", severityOf(joined, "projection.select_star"));
    }

    @Test void anEmptyPackDegradesGracefullyInsteadOfInventingFindings() {
        var result = DeterministicSqlAnalyzer.analyze("select * from orders", List.of());
        assertEquals("valid", result.get("parseStatus"));
        assertEquals(List.of(), result.get("findings"));
        assertEquals(List.of(), result.get("rulesFired"));
        assertTrue(result.get("suggestions").toString().contains("没有足够结构证据"));
    }

    @Test void everyFactTheExtractorProducesIsDeclaredInTheVocabulary() {
        var samples = List.of(
                "select * from a",
                "select a.id from a, b",
                "select distinct a.id from a join b on a.id=b.a_id left join c on b.id=c.b_id where a.x like '%y' and a.z = NULL limit 5",
                "select id from t order by upper(a) offset 100000",
                "select id from t where cast(a as int)=1 or not (b=1) and upper(c)='X'",
                "select id from t where id in (select id from u)",
                "select id from t where (select count(*) from u) > 1",
                "select id from a union select id from b",
                "delete from t",
                "update t set a=1 where id=1",
                "insert into t (a) values (1)",
                "this is not sql at all");

        var produced = new TreeSet<String>();
        for (var sql : samples) produced.addAll(SqlFactExtractor.extract(sql).facts().keySet());
        produced.removeAll(SqlFactVocabulary.FACTS_BY_KEY.keySet());

        assertEquals(Set.of(), produced, "抽取器产出了未登记的事实，规则作者无法发现它们");
    }

    @Test void shippedRulePackIsValidAgainstTheDeclaredVocabulary() {
        var pack = RulePacks.builtinById("sql-antipatterns").orElseThrow();
        assertEquals(List.of(), RulePacks.validate(pack));
        assertTrue(pack.rules().size() >= 20, "内置规则包应覆盖现有全部反模式检查");
    }

    @SuppressWarnings("unchecked")
    private static String severityOf(Map<String, Object> result, String code) {
        return ((List<Map<String, Object>>) result.get("findings")).stream()
                .filter(finding -> code.equals(finding.get("code")))
                .map(finding -> String.valueOf(finding.get("severity")))
                .findFirst().orElseThrow();
    }
}
