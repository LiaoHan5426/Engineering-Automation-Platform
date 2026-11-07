package com.lh.eap.application.retrieval;

import com.lh.eap.persistence.mapper.KnowledgeRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

/**
 * KR-01 adapter: maps {@link KnowledgeRepository} authorized search rows to baseline hits.
 * Metering label is {@code POSTGRES_FTS}; does not claim equivalence to the offline keyword probe ranker.
 */
public final class PostgresKnowledgeRetrieval {
    public static final String METERING = "POSTGRES_FTS";

    private final KnowledgeRepository repository;

    public PostgresKnowledgeRetrieval(KnowledgeRepository repository) {
        this.repository = Objects.requireNonNull(repository, "repository");
    }

    public List<RetrievalBaseline.Hit> search(String query, int limit, Set<UUID> allowedBases) {
        if (query == null || query.isBlank() || allowedBases == null || allowedBases.isEmpty()) return List.of();
        var rows = repository.searchAuthorized(query, Math.clamp(limit, 1, 20), List.copyOf(allowedBases));
        var hits = new ArrayList<RetrievalBaseline.Hit>(rows.size());
        for (Map<String, Object> row : rows) {
            hits.add(toHit(row));
        }
        return List.copyOf(hits);
    }

    static RetrievalBaseline.Hit toHit(Map<String, Object> row) {
        Objects.requireNonNull(row, "row");
        Object id = row.get("id");
        Object source = row.get("source");
        Object baseId = row.get("knowledgeBaseId");
        Object score = row.get("score");
        if (id == null || source == null || baseId == null || !(score instanceof Number number)) {
            throw new IllegalArgumentException("KNOWLEDGE_HIT_SHAPE");
        }
        return new RetrievalBaseline.Hit(id.toString(), source.toString(), baseId.toString(), number.doubleValue());
    }
}
