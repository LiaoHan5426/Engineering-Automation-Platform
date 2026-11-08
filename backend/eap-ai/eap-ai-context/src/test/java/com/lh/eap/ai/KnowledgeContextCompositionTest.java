package com.lh.eap.ai;

import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.knowledge.ExpertKnowledgeAccess;
import com.lh.eap.persistence.mapper.KnowledgeRepository;
import com.lh.eap.runtime.handler.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class KnowledgeContextCompositionTest {
    @Test void authorizedContextWorksWithoutWorkflowSqlOrMcpClasses() {
        for (String type : List.of("com.lh.eap.application.service.ExpertDefinitionService",
                "com.lh.eap.runtime.sql.DeterministicSqlAnalyzer", "com.lh.eap.runtime.mcp.McpSessionRegistry")) {
            assertThrows(ClassNotFoundException.class, () -> Class.forName(type));
        }
        var access = mock(ExpertKnowledgeAccess.class);
        var base = UUID.randomUUID();
        var manifest = new ExpertManifest("v1", "Expert", "reader", "Reader", List.of(base.toString()),
                List.of(), List.of(), List.of(), List.of());
        when(access.lockForKnowledge("reader")).thenReturn(Optional.of(Map.of("id", "reader", "revision", 1L,
                "enabled", true, "manifest", ExpertManifest.serialize(manifest))));
        when(access.knowledgeGrants("reader")).thenReturn(List.of(base));
        var repository = mock(KnowledgeRepository.class);
        when(repository.searchAuthorized("query", 5, List.of(base))).thenReturn(List.of(Map.of(
                "id", UUID.randomUUID(), "source", "guide.md", "knowledgeBase", "docs", "excerpt", "citation", "retrievalMode", "local-keyword")));
        var service = new ExpertKnowledgeContextService(access,
                new CapabilityHandlerRegistry(List.of(new KnowledgeSearchHandler(repository)), name -> true));
        var result = service.resolve(new KnowledgeExpertRef("reader", 1), "query");
        assertEquals("ready", result.status());
        assertEquals("guide.md", result.references().getFirst().source());
        verify(access, times(2)).lockForKnowledge("reader");
        verify(access, times(2)).knowledgeGrants("reader");
        verify(repository, never()).search(anyString(), anyInt());
    }
}
