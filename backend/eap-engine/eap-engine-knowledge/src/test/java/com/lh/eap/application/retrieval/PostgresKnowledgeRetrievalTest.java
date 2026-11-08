package com.lh.eap.application.retrieval;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.lh.eap.persistence.mapper.KnowledgeRepository;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PostgresKnowledgeRetrievalTest {

    @Test
    void mapsAuthorizedRowsAndRejectsEmptyGrants() {
        var base = UUID.randomUUID();
        var repository = mock(KnowledgeRepository.class);
        when(repository.searchAuthorized(eq("git status"), eq(5), eq(List.of(base)))).thenReturn(List.of(
                Map.of(
                        "id", UUID.fromString("11111111-1111-1111-1111-111111111111"),
                        "source", "tools/git-status.md",
                        "knowledgeBaseId", base.toString(),
                        "knowledgeBase", "authorized",
                        "score", 2.5,
                        "excerpt", "git status",
                        "retrievalMode", "local-keyword")));
        var probe = new PostgresKnowledgeRetrieval(repository);
        assertEquals(List.of(), probe.search("git status", 5, Set.of()));
        var hits = probe.search("git status", 5, Set.of(base));
        assertEquals(1, hits.size());
        assertEquals("tools/git-status.md", hits.getFirst().source());
        assertEquals(base.toString(), hits.getFirst().knowledgeBaseId());
        assertEquals(2.5, hits.getFirst().score());
    }

    @Test
    void toHitRequiresStableShape() {
        assertThrows(IllegalArgumentException.class, () -> PostgresKnowledgeRetrieval.toHit(Map.of("id", "x")));
        var hit = PostgresKnowledgeRetrieval.toHit(Map.of(
                "id", "d1",
                "source", "a.md",
                "knowledgeBaseId", UUID.randomUUID().toString(),
                "score", 1));
        assertEquals("d1", hit.id());
    }
}
