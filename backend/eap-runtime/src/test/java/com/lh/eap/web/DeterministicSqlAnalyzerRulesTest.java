package com.lh.eap.web;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;

class DeterministicSqlAnalyzerRulesTest {
    @Test void flagsLeadingWildcardLikeAndFunctionOnColumn(){
        var result=DeterministicSqlAnalyzer.analyze("select id from users where upper(name) = 'A' and email like '%x'");
        var codes=rules(result);
        assertTrue(codes.contains("predicate.function_on_column"));
        assertTrue(codes.contains("predicate.like.leading_wildcard"));
    }
    @Test void flagsLimitWithoutOrderAndNullComparison(){
        var result=DeterministicSqlAnalyzer.analyze("select id from users where deleted_at = NULL limit 10");
        var codes=rules(result);
        assertTrue(codes.contains("query.limit_without_order"));
        assertTrue(codes.contains("predicate.null_comparison"));
    }
    @Test void flagsDmlWithoutFilterAsCritical(){
        var result=DeterministicSqlAnalyzer.analyze("delete from users");
        assertEquals("critical",severity(result,"dml.no_filter"));
    }
    @Test void complexQueryWithLowConfidenceRequestsModelReview(){
        var result=DeterministicSqlAnalyzer.analyze("select a.id from a join b on a.id=b.a_id join c on b.id=c.b_id where a.x || b.y is not null");
        assertEquals("valid",result.get("parseStatus"));
        assertTrue(((Number)result.get("complexity")).intValue()>0);
        assertNotNull(result.get("deterministicConfidence"));
        assertNotNull(result.get("requiresModelReview"));
    }
    @Test void unionAndDistinctAreReported(){
        var result=DeterministicSqlAnalyzer.analyze("select distinct id from a union select id from b");
        var codes=rules(result);
        assertTrue(codes.contains("set.union"));
        assertTrue(codes.contains("query.distinct"));
    }
    @Test void structuredFindingsCarrySeverityAndEvidence(){
        var result=DeterministicSqlAnalyzer.analyze("select * from a");
        @SuppressWarnings("unchecked")
        var findings=(List<java.util.Map<String,Object>>)result.get("findings");
        assertFalse(findings.isEmpty());
        assertTrue(findings.stream().anyMatch(f->"projection.select_star".equals(f.get("code"))
                && f.containsKey("severity")&&f.containsKey("evidence")&&f.containsKey("confidence")));
    }
    private static List<String> rules(java.util.Map<String,Object> result){
        @SuppressWarnings("unchecked")
        var fired=(List<String>)result.get("rulesFired");
        return fired;
    }
    @SuppressWarnings("unchecked")
    private static String severity(java.util.Map<String,Object> result,String code){
        return ((List<java.util.Map<String,Object>>)result.get("findings")).stream()
                .filter(f->code.equals(f.get("code"))).map(f->(String)f.get("severity")).findFirst().orElse("");
    }
}
