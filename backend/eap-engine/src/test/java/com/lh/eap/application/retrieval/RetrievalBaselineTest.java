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
        assertTrue(report.totalSearchDurationMs() >= 0);
        assertEquals(report.results().stream().mapToLong(RetrievalBaseline.CaseResult::durationMs).sum(),
                report.totalSearchDurationMs());
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

    @Test
    void rankingFixtureBeatsDistractorsAtExpectedMaxRank() {
        var authorized = UUID.randomUUID();
        var foreign = UUID.randomUUID();
        var probe = KeywordRetrievalProbe.rankingCorpus(authorized, foreign);
        var report = RetrievalBaseline.evaluate(
                RetrievalBaseline.rankingFixtureCases(authorized),
                testCase -> probe.search(testCase.query(), testCase.topK(), testCase.allowedBases()));
        assertEquals(1.0, report.rankingPassRate());
        assertTrue(report.meetsDeclaredThresholds());
        assertTrue(report.results().stream().allMatch(RetrievalBaseline.CaseResult::passed));
        for (var result : report.results()) {
            assertNotNull(result.bestRank());
            assertEquals(1, result.bestRank());
            assertEquals("", result.failure());
        }
    }

    @Test
    void productionSampleRankingMeetsDeclaredThresholdAgainstDistractors() {
        var authorized = UUID.randomUUID();
        var foreign = UUID.randomUUID();
        var probe = KeywordRetrievalProbe.rankingCorpus(authorized, foreign);
        var report = RetrievalBaseline.evaluate(
                RetrievalBaseline.productionSampleCases(authorized),
                testCase -> probe.search(testCase.query(), testCase.topK(), testCase.allowedBases()),
                "KEYWORD_PROBE_PRODUCTION_SAMPLE");
        assertEquals("KEYWORD_PROBE_PRODUCTION_SAMPLE", report.metering());
        assertEquals(1.0, report.rankingPassRate());
        assertTrue(report.meetsDeclaredThresholds());
        assertTrue(report.results().stream().allMatch(RetrievalBaseline.CaseResult::passed));
        for (var result : report.results()) {
            assertNotNull(result.bestRank());
            assertTrue(result.bestRank() <= 2);
        }
    }

    @Test
    void rankingFailureWhenGoldIsNotFirst() {
        var authorized = UUID.randomUUID();
        var probe = new KeywordRetrievalProbe(List.of(
                new KeywordRetrievalProbe.Document("noise", "tools/git-help.md", authorized,
                        "git status 只读工具"),
                new KeywordRetrievalProbe.Document("gold", "tools/git-status.md", authorized,
                        "git 仓库状态检查说明")));
        var report = RetrievalBaseline.evaluate(
                List.of(new RetrievalBaseline.Case(
                        "rank-should-fail",
                        "ranking",
                        "git status 只读工具",
                        Set.of("tools/git-status.md"),
                        Set.of(authorized),
                        5,
                        false,
                        1)),
                testCase -> probe.search(testCase.query(), testCase.topK(), testCase.allowedBases()));
        assertEquals(0.0, report.rankingPassRate());
        assertFalse(report.meetsDeclaredThresholds());
        assertEquals("RANK_TOO_LOW", report.results().getFirst().failure());
        assertTrue(report.results().getFirst().bestRank() > 1);
    }
}
