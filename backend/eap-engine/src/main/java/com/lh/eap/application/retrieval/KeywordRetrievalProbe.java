package com.lh.eap.application.retrieval;

import com.lh.eap.persistence.mapper.KnowledgeRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * Offline keyword probe that reuses {@link KnowledgeRepository#terms(String)} tokenization.
 * Not a substitute for PostgreSQL FTS ranking; used only for KR-01 predetermined baselines.
 */
public final class KeywordRetrievalProbe {
    public record Document(String id, String source, UUID knowledgeBaseId, String content) {
        public Document {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(source, "source");
            Objects.requireNonNull(knowledgeBaseId, "knowledgeBaseId");
            Objects.requireNonNull(content, "content");
        }
    }

    private final List<Document> documents;

    public KeywordRetrievalProbe(List<Document> documents) {
        this.documents = List.copyOf(documents);
    }

    public List<Document> documents() {
        return documents;
    }

    public List<RetrievalBaseline.Hit> search(String query, int limit, Set<UUID> allowedBases) {
        if (query == null || query.isBlank() || allowedBases == null || allowedBases.isEmpty()) return List.of();
        var terms = KnowledgeRepository.terms(query);
        if (terms.isEmpty() && query.trim().length() < 2) return List.of();
        var hits = new ArrayList<RetrievalBaseline.Hit>();
        String loweredQuery = query.toLowerCase(Locale.ROOT);
        for (var document : documents) {
            if (!allowedBases.contains(document.knowledgeBaseId())) continue;
            String content = document.content().toLowerCase(Locale.ROOT);
            double score = 0;
            if (content.contains(loweredQuery.trim())) score += 2.0;
            for (var term : terms) {
                if (content.contains(term.toLowerCase(Locale.ROOT))) score += 1.0;
            }
            if (score > 0) {
                hits.add(new RetrievalBaseline.Hit(document.id(), document.source(),
                        document.knowledgeBaseId().toString(), score));
            }
        }
        hits.sort(Comparator.comparingDouble(RetrievalBaseline.Hit::score).reversed()
                .thenComparing(RetrievalBaseline.Hit::id));
        int top = Math.clamp(limit, 1, 20);
        return hits.size() <= top ? List.copyOf(hits) : List.copyOf(hits.subList(0, top));
    }

    public static KeywordRetrievalProbe fixtureCorpus(UUID authorizedBase, UUID foreignBase) {
        return new KeywordRetrievalProbe(List.of(
                new Document("d1", "tools/git-status.md", authorizedBase,
                        "git status 是只读工具，用于查看仓库工作区变更，不执行写操作。"),
                new Document("d2", "models/wire-api.md", authorizedBase,
                        "普通 API 连接可显式选择 wireApi，responses protocol 用于文本与代码提案。"),
                new Document("d3", "chat/context-budget.md", authorizedBase,
                        "如何配置上下文预算：平台按字符估算计量，预留输出并在超限时拒绝。"),
                new Document("d4", "chat/proposal-refuse.md", authorizedBase,
                        "操作者可以拒绝代码提案 refuse proposal，会话与看板状态保持一致。"),
                new Document("d5", "docs/needle.md", authorizedBase,
                        "fixture needle updated-private content for update/delete baseline."),
                new Document("d6", "secrets/foreign.md", foreignBase,
                        "foreign secret token must never leak across knowledge base grants."),
                new Document("d7", "chat/unrelated.md", authorizedBase,
                        "完全无关的桌面外壳布局说明，不应被虚构主题命中。")
        ));
    }

    /**
     * Ranking corpus: baseline docs plus weaker distractors that share partial tokens.
     * Gold sources in {@link RetrievalBaseline#rankingFixtureCases} must still rank first.
     */
    public static KeywordRetrievalProbe rankingCorpus(UUID authorizedBase, UUID foreignBase) {
        var base = fixtureCorpus(authorizedBase, foreignBase).documents();
        var docs = new ArrayList<>(base);
        docs.add(new Document("d8", "tools/git-help.md", authorizedBase,
                "git 帮助：clone commit push pull，介绍常见写操作命令，不谈 status 只读检查。"));
        docs.add(new Document("d9", "models/wire-notes.md", authorizedBase,
                "wire 连接笔记：记录超时与重试，未写 responses protocol 或代码提案。"));
        docs.add(new Document("d10", "chat/budget-ui.md", authorizedBase,
                "预算界面布局与按钮文案，不含上下文计量、输出预留或超限拒绝逻辑。"));
        return new KeywordRetrievalProbe(docs);
    }
}
