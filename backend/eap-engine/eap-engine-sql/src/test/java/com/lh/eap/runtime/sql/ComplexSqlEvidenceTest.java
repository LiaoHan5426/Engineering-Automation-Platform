package com.lh.eap.runtime.sql;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ComplexSqlEvidenceTest {
    @ParameterizedTest
    @ValueSource(strings = {
            "with paid as (select customer_id, sum(amount) total from orders group by customer_id) select * from paid",
            "select c.id from customers c where c.id in (select customer_id from orders)",
            "select row_number() over (partition by region order by id) rn from customers",
            "select customer_id, sum(amount) from orders group by customer_id having sum(amount)>1000",
            "select q.id from (select id from customers) q"
    })
    void parsesUnsupportedScopesWithoutClaimingCompleteAnalysis(String sql) {
        var result = DeterministicSqlAnalyzer.analyze(sql);
        assertEquals("valid", result.get("parseStatus"));
        assertEquals(true, ((Map<?, ?>) result.get("facts")).get("parse.partial"));
        assertEquals(true, result.get("requiresModelReview"));
        assertTrue(((Number) result.get("deterministicConfidence")).doubleValue() <= 0.5);
        assertFalse(result.get("summary").toString().contains("未见明显反模式"));
        assertTrue(result.get("suggestions").toString().contains("只覆盖已抽取部分"));
    }

    @Test void distinguishesAntiMembershipAndWarnsAboutNullWithoutPromisingEquivalence() {
        var negative = DeterministicSqlAnalyzer.analyze("select id from customers where id not in (select customer_id from orders)");
        var rules = (List<?>) negative.get("rulesFired");
        assertTrue(rules.contains("predicate.not_in_subquery"));
        assertFalse(rules.contains("predicate.in_subquery"));
        assertTrue(negative.get("suggestions").toString().contains("不保证与原NOT IN等价"));
        var positive = DeterministicSqlAnalyzer.analyze("select id from customers where id in (select customer_id from orders)");
        assertTrue(((List<?>) positive.get("rulesFired")).contains("predicate.in_subquery"));
        assertFalse(((List<?>) positive.get("rulesFired")).contains("predicate.not_in_subquery"));
        var simple = DeterministicSqlAnalyzer.analyze("select id from customers where id=1");
        assertFalse(Boolean.TRUE.equals(((Map<?, ?>) simple.get("facts")).get("parse.partial")));
        assertEquals(false, simple.get("requiresModelReview"));
    }
}
