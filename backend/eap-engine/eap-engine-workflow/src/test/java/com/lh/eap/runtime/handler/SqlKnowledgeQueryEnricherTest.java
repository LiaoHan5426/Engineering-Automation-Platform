package com.lh.eap.runtime.handler;
import com.lh.eap.domain.model.CapabilityContext;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
class SqlKnowledgeQueryEnricherTest {
    @Test void sqlHintsAreAnExplicitProductContribution() {
        var context = new CapabilityContext(null,null,"","slow query","expert",UUID.randomUUID(),List.of(),new HashMap<>(),
                Map.of("tables", List.of("orders"), "joinKeys", List.of("id")),new ArrayList<>(),new ArrayList<>(),List.of(),null,Set.of());
        assertEquals("slow query orders join 关联 索引", new SqlKnowledgeQueryEnricher().enrich(context,context.question()));
    }
}
