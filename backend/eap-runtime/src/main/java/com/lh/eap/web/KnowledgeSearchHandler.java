package com.lh.eap.web;

import com.lh.eap.rules.SqlFactVocabulary;
import java.util.*;
import org.springframework.stereotype.Component;

/** Retrieves evidence from only the knowledge bases explicitly granted to the expert. */
@Component
public class KnowledgeSearchHandler implements CapabilityHandler {
    private static final String CAPABILITY = SqlFactVocabulary.KNOWLEDGE_SEARCH;

    private final KnowledgeRepository knowledge;

    public KnowledgeSearchHandler(KnowledgeRepository knowledge) { this.knowledge = knowledge; }

    @Override public Set<String> capabilities() { return Set.of(CAPABILITY); }

    @Override public CapabilityKind kind() { return CapabilityKind.COMMAND; }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor(CAPABILITY, kind(),
                "检索授权知识",
                "在专家被显式授权的知识库内做本地关键词 + PostgreSQL 全文检索，并为每条结果附来源引用。不会读取未授权知识库。",
                List.of("question", "sql（用于提取表名与连接线索）"),
                List.of("专家启用时授权的知识库（eap.expert_knowledge_grant）"),
                "KnowledgeRepository · PostgreSQL FTS（本地）",
                SqlFactVocabulary.factsOf(CAPABILITY).stream().map(SqlFactVocabulary.Fact::key).toList(),
                List.of("knowledgeEvidence"),
                true));
    }

    @SuppressWarnings("unchecked")
    @Override public NodeResult handle(CapabilityContext context) {
        var query = context.question() + " " + String.join(" ",
                (List<String>) context.analysis().getOrDefault("tables", List.of()));
        if (!((List<?>) context.analysis().getOrDefault("joinKeys", List.of())).isEmpty()) {
            query += " join 关联 索引";
        }
        var matches = knowledge.searchAuthorized(query, 5, context.grants());
        context.evidence().addAll(matches);
        context.publish("knowledge.granted", !context.grants().isEmpty());
        context.publish("knowledge.matches", matches.size());
        for (var match : matches) {
            context.advice().add("知识依据：" + match.get("knowledgeBase") + " / " + match.get("source") + "\n"
                    + SensitiveData.redact((String) match.get("excerpt")));
        }
        return new NodeResult(true, matches.isEmpty(),
                context.grants().isEmpty() ? "此专家尚未获得知识库读取授权"
                        : matches.isEmpty() ? "授权知识库中没有匹配内容"
                        : "已检索授权知识，引用内容仍需结合当前 SQL 验证",
                Map.of("matches", matches, "retrievalMode", "local-keyword"));
    }
}
