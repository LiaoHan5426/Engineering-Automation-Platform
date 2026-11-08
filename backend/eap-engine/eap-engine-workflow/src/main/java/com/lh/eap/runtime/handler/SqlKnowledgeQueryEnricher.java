package com.lh.eap.runtime.handler;
import com.lh.eap.domain.model.CapabilityContext;
import java.util.List;
import org.springframework.stereotype.Component;
/** Product integration preserving SQL table/join retrieval hints. */
@Component
public final class SqlKnowledgeQueryEnricher implements KnowledgeQueryEnricher {
    @SuppressWarnings("unchecked")
    public String enrich(CapabilityContext context, String query) {
        var tables = String.join(" ", (List<String>) context.analysis().getOrDefault("tables", List.of()));
        if (!tables.isEmpty()) query += " " + tables;
        if (!((List<?>) context.analysis().getOrDefault("joinKeys", List.of())).isEmpty()) query += " join 关联 索引";
        return query;
    }
}
