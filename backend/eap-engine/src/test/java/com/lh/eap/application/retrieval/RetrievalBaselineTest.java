package com.lh.eap.application.retrieval;

import static org.junit.jupiter.api.Assertions.*;

import com.lh.eap.persistence.mapper.KnowledgeRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RetrievalBaselineTest {

    @Test
    void predeterminedFixtureCorpusMeetsDeclaredThresholds() {
        var authorized = UUID.randomUUID();
        var foreign = UUID.randomUUID();
        var probe = KeywordRetrievalProbe.fixtureCorpus(authorized, foreign);
        var report = RetrievalBaseline.evaluate(
                RetrievalBaseline.fixtureCases(authorized, foreign),
                testCase -> probe.search(testCase.query(), testCase.topK(), testCase.allowedBases()));
        assertEquals("KEYWORD_PROBE", report.metering());
        assertEquals(1.0, report.directRecallAtK());
        assertEquals(1.0, report.chineseRecallAtK());
        assertEquals(0, report.authzFailures());
        assertEquals(0, report.emptyFailures());
        assertTrue(report.meetsDeclaredThresholds());
        assertTrue(report.results().stream().allMatch(RetrievalBaseline.CaseResult::passed));
    }

    @Test
    void authzGrantCannotSurfaceForeignSource() {
        var authorized = UUID.randomUUID();
        var foreign = UUID.randomUUID();
        var probe = KeywordRetrievalProbe.fixtureCorpus(authorized, foreign);
        var hits = probe.search("foreign secret token", 5, Set.of(authorized));
        assertTrue(hits.stream().noneMatch(hit -> hit.source().equals("secrets/foreign.md")));
        var leaked = probe.search("foreign secret token", 5, Set.of(foreign));
        assertTrue(leaked.stream().anyMatch(hit -> hit.source().equals("secrets/foreign.md")));
    }

    @Test
    void deletedDocumentStopsMatching() {
        var authorized = UUID.randomUUID();
        var foreign = UUID.randomUUID();
        var full = KeywordRetrievalProbe.fixtureCorpus(authorized, foreign);
        assertFalse(full.search("needle updated-private", 5, Set.of(authorized)).isEmpty());
        var afterDelete = new KeywordRetrievalProbe(List.of(
                new KeywordRetrievalProbe.Document("d1", "tools/git-status.md", authorized, "git status 只读工具"),
                new KeywordRetrievalProbe.Document("d2", "models/wire-api.md", authorized, "wireApi responses protocol"),
                new KeywordRetrievalProbe.Document("d3", "chat/context-budget.md", authorized, "如何配置上下文预算"),
                new KeywordRetrievalProbe.Document("d4", "chat/proposal-refuse.md", authorized, "拒绝代码提案 refuse proposal"),
                new KeywordRetrievalProbe.Document("d6", "secrets/foreign.md", foreign, "foreign secret token"),
                new KeywordRetrievalProbe.Document("d7", "chat/unrelated.md", authorized, "桌面外壳")
        ));
        assertTrue(afterDelete.search("needle updated-private", 5, Set.of(authorized)).isEmpty());
    }

    @Test
    void termsExtractorKeepsHanBigramsAndIdentifiers() {
        var terms = KnowledgeRepository.terms("如何配置 wireApi 上下文");
        assertTrue(terms.contains("wireapi") || terms.stream().anyMatch(t -> t.contains("wire")));
        assertTrue(terms.stream().anyMatch(t -> t.length() == 2));
        assertFalse(KnowledgeRepository.terms("a").stream().anyMatch(t -> t.equals("a")));
    }

    @Test
    void emptyAllowedBasesYieldNoHits() {
        var authorized = UUID.randomUUID();
        var probe = KeywordRetrievalProbe.fixtureCorpus(authorized, UUID.randomUUID());
        assertEquals(List.of(), probe.search("git status", 5, Set.of()));
    }
}
