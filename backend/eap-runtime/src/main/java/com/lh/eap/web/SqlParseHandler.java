package com.lh.eap.web;

import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.springframework.stereotype.Component;

/**
 * Structural SQL extraction.
 *
 * <p>The handler contains no domain rules and no judgement: it parses the statement, publishes the
 * structural facts it can prove, and leaves. Severity, wording and recommendations are produced later
 * by the rule packs the expert declared, evaluated once the whole graph has run — so a rule may combine
 * SQL shape with snapshot and plan facts.
 */
@Component
public class SqlParseHandler implements CapabilityHandler {
    static final String CAPABILITY = SqlFactVocabulary.SQL_PARSE;

    @Override public Set<String> capabilities() { return Set.of(CAPABILITY); }

    @Override public CapabilityKind kind() { return CapabilityKind.COMMAND; }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor(CAPABILITY, kind(),
                "解析 SQL 并抽取结构事实",
                "用 JSQLParser 解析输入语句并发布投影、连接、谓词、分页等结构事实。不执行 SQL、不连接数据库、不判定对错、也不生成改写。",
                List.of("sql（留空则跳过解析）"),
                List.of(),
                "JSQLParser + SqlFactExtractor（进程内，无外部依赖）",
                SqlFactVocabulary.factsOf(CAPABILITY).stream().map(SqlFactVocabulary.Fact::key).toList(),
                List.of("tables", "joinKeys", "joinColumns"),
                true));
    }

    @SuppressWarnings("unchecked")
    @Override public NodeResult handle(CapabilityContext context) {
        if (context.sql().isBlank()) {
            context.analysis().put("parseStatus", "missing");
            return new NodeResult(true, true, "未提供 SQL：跳过结构抽取，保留其余证据路径", Map.of());
        }
        var skeleton = DeterministicSqlAnalyzer.extract(context.sql());
        var facts = (Map<String, Object>) skeleton.remove("facts");
        facts.forEach(context::publish);
        context.analysis().putAll(skeleton);
        boolean parsed = "valid".equals(skeleton.get("parseStatus"));
        return new NodeResult(parsed, false,
                "已用 SQL AST 抽取 " + facts.size() + " 项结构事实；判定在流程图执行完成后统一进行",
                Map.of("statementType", String.valueOf(skeleton.get("statementType")),
                        "factCount", facts.size()));
    }
}
