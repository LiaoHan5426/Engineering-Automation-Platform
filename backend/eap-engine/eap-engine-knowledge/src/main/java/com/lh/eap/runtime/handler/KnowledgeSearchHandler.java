package com.lh.eap.runtime.handler;

import com.lh.eap.persistence.mapper.KnowledgeRepository;
import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.domain.model.CapabilityDescriptor;
import com.lh.eap.domain.model.NodeResult;
import com.lh.eap.common.SensitiveData;


import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Autowired;

/** Retrieves evidence from only the knowledge bases explicitly granted to the expert. */
@Component
public class KnowledgeSearchHandler implements CapabilityHandler {
    private static final String CAPABILITY = "knowledge.search";

    private final KnowledgeRepository knowledge;

    private final List<KnowledgeQueryEnricher> enrichers;
    public KnowledgeSearchHandler(KnowledgeRepository knowledge) { this(knowledge, List.of()); }
    @Autowired
    public KnowledgeSearchHandler(KnowledgeRepository knowledge, List<KnowledgeQueryEnricher> enrichers) {
        this.knowledge = knowledge;
        this.enrichers = List.copyOf(enrichers);
    }

    @Override public Set<String> capabilities() { return Set.of(CAPABILITY); }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor(CAPABILITY, kind(),
                "检索授权知识",
                "在专家被显式授权的知识库内做本地关键词 + PostgreSQL 全文检索，并为每条结果附来源引用。不会读取未授权知识库。",
                List.of("question", "可选调用领域提供的检索线索"),
                List.of("专家启用时授权的知识库（eap.expert_knowledge_grant）"),
                "KnowledgeRepository · PostgreSQL FTS（本地）",
                List.of("knowledge.granted", "knowledge.matches"),
                List.of("knowledgeEvidence"),
                true));
    }

    @SuppressWarnings("unchecked")
    @Override public NodeResult handle(CapabilityContext context) {
        String query = context.question();
        for (var enricher : enrichers) query = enricher.enrich(context, query);
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
                        : "已检索授权知识，引用内容仍需结合当前任务验证",
                Map.of("matches", matches, "retrievalMode", "local-keyword"));
    }
}
