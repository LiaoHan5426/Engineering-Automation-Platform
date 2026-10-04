package com.lh.eap.web;

import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import java.util.*;

final class DeterministicSqlAnalyzer {
    private DeterministicSqlAnalyzer() { }

    static Map<String, Object> analyze(String sql) {
        try {
            var statement = CCJSqlParserUtil.parse(sql);
            var normalized = statement.toString();
            var findings = new ArrayList<String>();
            var suggestions = new ArrayList<String>();
            if (normalized.matches("(?is).*SELECT\\s+\\*.*")) { findings.add("projection.select_star"); suggestions.add("只选择业务需要的列，避免 SELECT * 带来的回表、网络传输和 schema 变更风险。"); }
            if (normalized.matches("(?is).*SELECT.*FROM\\s+[^\\s,]+\\s*$")) { findings.add("query.full_scan_possible"); suggestions.add("当前查询缺少可见过滤条件；请结合数据量确认是否需要 WHERE，必要时检查 EXPLAIN。"); }
            if (normalized.matches("(?is).*\\b(UPDATE|DELETE)\\b.*\\bWHERE\\b.*")) { findings.add("mutation.requires_scope_review"); suggestions.add("修改语句需要确认 WHERE 范围，并在事务中先执行对应 SELECT 验证影响行数。"); }
            if (suggestions.isEmpty()) suggestions.add("语句结构可解析；请结合已授权表结构和 EXPLAIN 结果继续评估索引、连接顺序和基数估算。");
            return Map.of("parseStatus", "valid", "statementType", statement.getClass().getSimpleName(), "normalizedSql", normalized, "findings", findings, "suggestions", suggestions);
        } catch (Exception ex) {
            return Map.of("parseStatus", "invalid", "error", ex.getMessage() == null ? "SQL parse failed" : ex.getMessage());
        }
    }
}
