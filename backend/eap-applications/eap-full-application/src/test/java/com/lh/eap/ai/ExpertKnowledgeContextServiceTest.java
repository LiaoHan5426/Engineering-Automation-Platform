package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lh.eap.application.service.ExpertDefinitionService;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.persistence.mapper.*;
import com.lh.eap.runtime.handler.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class ExpertKnowledgeContextServiceTest {
    @Test void queryIsBoundedWithoutSilentlyTruncatingTheQuestion() {
        var f = new Fixture();
        for (String query : Arrays.asList(null, "", " ", "x".repeat(501))) {
            var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> f.service.resolve(f.ref, query));
            assertEquals(query != null && query.length() > 500 ? "EXPERT_CONTEXT_QUERY_TOO_LARGE" : "INVALID_EXPERT_CONTEXT", error.getReason());
        }
        verifyNoInteractions(f.knowledge);
        assertEquals("no_matches", f.service.resolve(f.ref, "x".repeat(500)).status());
        verify(f.knowledge).searchAuthorized("x".repeat(500), 5, List.of(f.base));
    }
    @Test void revocationOrRevisionChangeDuringReadFailsClosed() {
        for (String change : List.of("grants", "revision", "capability")) {
            var f = new Fixture();
            when(f.knowledge.searchAuthorized(anyString(), anyInt(), anyList())).thenAnswer(call -> {
                if (change.equals("grants")) when(f.experts.knowledgeGrants("expert-a")).thenReturn(List.of());
                if (change.equals("revision")) when(f.definitions.lockForKnowledge("expert-a")).thenReturn(Optional.of(f.row(true, 3, "expert-a")));
                if (change.equals("capability")) when(f.settings.enabled("knowledge.search")).thenReturn(false);
                return List.of();
            });
            assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> f.service.resolve(f.ref, "marker"), change);
        }
    }
    @Test void evidenceIsBoundedAndRedactedEvenWhenAnAdapterReturnsMore() {
        var f = new Fixture();
        var item = Map.<String,Object>of("id", UUID.randomUUID(), "source", "x".repeat(1000), "knowledgeBase", "x".repeat(1000),
                "excerpt", "x".repeat(2000), "retrievalMode", "local-keyword");
        when(f.knowledge.searchAuthorized(anyString(), anyInt(), anyList())).thenReturn(Collections.nCopies(8, item));
        var result = f.service.resolve(f.ref, "marker");
        assertEquals(5, result.references().size());
        assertEquals(1200, result.references().getFirst().excerpt().length());
        assertEquals(500, result.references().getFirst().source().length());
        assertEquals(200, result.references().getFirst().knowledgeBase().length());
    }
    static class Fixture {
        final ExpertDefinitionMapper definitions = mock(ExpertDefinitionMapper.class);
        final ExpertDefinitionService experts = mock(ExpertDefinitionService.class);
        final KnowledgeRepository knowledge = mock(KnowledgeRepository.class);
        final com.lh.eap.application.service.CapabilitySettings settings = mock(com.lh.eap.application.service.CapabilitySettings.class);
        final UUID base = UUID.randomUUID();
        final KnowledgeExpertRef ref = new KnowledgeExpertRef("expert-a", 2);
        final ExpertKnowledgeContextService service = new ExpertKnowledgeContextService(new com.lh.eap.application.service.WorkflowExpertKnowledgeAccess(definitions, experts),
                new CapabilityHandlerRegistry(List.of(new KnowledgeSearchHandler(knowledge)), settings));
        Map<String,Object> row(boolean enabled, long revision, String manifestId) {
            var manifest = new ExpertManifest("v1", "Expert", manifestId, "A", List.of(base.toString()), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), new com.lh.eap.domain.model.ExpertBehaviorBinding("sql-analysis", 1));
            return Map.of("id", "expert-a", "manifest", ExpertManifest.serialize(manifest), "enabled", enabled, "revision", revision);
        }
        Fixture() {
            when(definitions.lockForKnowledge("expert-a")).thenReturn(Optional.of(row(true, 2, "expert-a")));
            when(experts.knowledgeGrants("expert-a")).thenReturn(List.of(base));
            when(settings.enabled("knowledge.search")).thenReturn(true);
        }
    }
    @Test void invalidLiveAuthorityIsRejectedBeforeRetrieval() {
        for (String reason : List.of("NOT_FOUND", "STALE", "DISABLED", "NOT_AUTHORIZED", "CAPABILITY_UNAVAILABLE", "IDENTITY_MISMATCH")) {
            var f = new Fixture();
            switch (reason) {
                case "NOT_FOUND" -> when(f.definitions.lockForKnowledge("expert-a")).thenReturn(Optional.empty());
                case "STALE" -> when(f.definitions.lockForKnowledge("expert-a")).thenReturn(Optional.of(f.row(true, 3, "expert-a")));
                case "DISABLED" -> when(f.definitions.lockForKnowledge("expert-a")).thenReturn(Optional.of(f.row(false, 2, "expert-a")));
                case "NOT_AUTHORIZED" -> when(f.experts.knowledgeGrants("expert-a")).thenReturn(List.of(UUID.randomUUID()));
                case "CAPABILITY_UNAVAILABLE" -> when(f.settings.enabled("knowledge.search")).thenReturn(false);
                case "IDENTITY_MISMATCH" -> when(f.definitions.lockForKnowledge("expert-a")).thenReturn(Optional.of(f.row(true, 2, "expert-b")));
            }
            var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> f.service.resolve(f.ref, "marker"), reason);
            assertEquals("EXPERT_CONTEXT_" + (reason.equals("IDENTITY_MISMATCH") ? "STALE" : reason), error.getReason());
            verifyNoInteractions(f.knowledge);
        }
    }
    @Test void previewUsesOnlyDeclaredPersistedGrantsThroughTheExistingHandler() {
        var jdbc = mock(JdbcTemplate.class);
        var grants = mock(ExpertDefinitionService.class);
        var knowledge = mock(KnowledgeRepository.class);
        var allowed = UUID.randomUUID(); var undeclared = UUID.randomUUID();
        var manifest = new ExpertManifest("v1", "Expert", "expert-a", "A", List.of(allowed.toString()), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), new com.lh.eap.domain.model.ExpertBehaviorBinding("sql-analysis", 1));
        when(jdbc.queryForList(anyString(), eq("expert-a"))).thenReturn(List.of(Map.of("id", "expert-a", "manifest", ExpertManifest.serialize(manifest), "enabled", true, "revision", 2L)));
        when(grants.knowledgeGrants("expert-a")).thenReturn(List.of(allowed, undeclared));
        when(knowledge.searchAuthorized(anyString(), eq(5), eq(List.of(allowed)))).thenReturn(List.of(Map.of("id", UUID.randomUUID(), "source", "source.md", "knowledgeBase", "A", "excerpt", "private-a", "retrievalMode", "local-keyword")));
        var service = new ExpertKnowledgeContextService(new com.lh.eap.application.service.WorkflowExpertKnowledgeAccess(new ExpertDefinitionMapper(jdbc), grants),
                new CapabilityHandlerRegistry(List.of(new KnowledgeSearchHandler(knowledge))));
        var result = service.resolve(new KnowledgeExpertRef("expert-a", 2), "marker");
        assertEquals("ready", result.status());
        assertEquals("private-a", result.references().getFirst().excerpt());
        verify(knowledge).searchAuthorized("marker", 5, List.of(allowed));
        verify(knowledge, never()).search(anyString(), anyInt());
    }
}
