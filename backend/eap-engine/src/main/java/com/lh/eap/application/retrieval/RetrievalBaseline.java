package com.lh.eap.application.retrieval;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

/**
 * KR-01 predetermined retrieval cases and offline metrics.
 * Does not claim provider quality or vector recall; scores only returned hits.
 */
public final class RetrievalBaseline {
    public static final int DEFAULT_TOP_K = 5;
    /** Direct keyword / identifier fixtures must all hit within topK. */
    public static final double DIRECT_RECALL_AT_K_THRESHOLD = 1.0;
    /** Chinese bigram fixtures must all hit within topK under the keyword probe. */
    public static final double CHINESE_RECALL_AT_K_THRESHOLD = 1.0;

    private RetrievalBaseline() {}

    public record Hit(String id, String source, String knowledgeBaseId, double score) {
        public Hit {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(source, "source");
            Objects.requireNonNull(knowledgeBaseId, "knowledgeBaseId");
        }
    }

    public record Case(
            String id,
            String kind,
            String query,
            Set<String> expectedSources,
            Set<UUID> allowedBases,
            int topK,
            boolean expectEmpty) {
        public Case {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(kind, "kind");
            Objects.requireNonNull(query, "query");
            expectedSources = Set.copyOf(expectedSources == null ? Set.of() : expectedSources);
            allowedBases = Set.copyOf(allowedBases == null ? Set.of() : allowedBases);
            if (topK < 1 || topK > 20) throw new IllegalArgumentException("topK");
        }
    }

    public record CaseResult(
            String id,
            String kind,
            boolean passed,
            int hitAtK,
            int expectedCount,
            Integer bestRank,
            int returned,
            String failure,
            long durationMs) {
        public CaseResult {
            if (durationMs < 0) durationMs = 0;
        }
    }

    public record Report(
            String metering,
            List<CaseResult> results,
            double directRecallAtK,
            double chineseRecallAtK,
            int authzFailures,
            int emptyFailures,
            long totalSearchDurationMs) {
        public Report {
            if (totalSearchDurationMs < 0) totalSearchDurationMs = 0;
        }

        public boolean meetsDeclaredThresholds() {
            return directRecallAtK >= DIRECT_RECALL_AT_K_THRESHOLD
                    && chineseRecallAtK >= CHINESE_RECALL_AT_K_THRESHOLD
                    && authzFailures == 0
                    && emptyFailures == 0;
        }
    }

    public static Report evaluate(List<Case> cases, Function<Case, List<Hit>> search) {
        return evaluate(cases, search, "KEYWORD_PROBE");
    }

    public static Report evaluate(List<Case> cases, Function<Case, List<Hit>> search, String metering) {
        Objects.requireNonNull(cases, "cases");
        Objects.requireNonNull(search, "search");
        Objects.requireNonNull(metering, "metering");
        if (metering.isBlank()) throw new IllegalArgumentException("metering");
        var results = new ArrayList<CaseResult>();
        int directHit = 0, directTotal = 0, chineseHit = 0, chineseTotal = 0;
        int authzFailures = 0, emptyFailures = 0;
        long totalMs = 0;
        for (var testCase : cases) {
            long started = System.nanoTime();
            List<Hit> hits = List.copyOf(search.apply(testCase));
            long durationMs = Math.max(0, (System.nanoTime() - started) / 1_000_000L);
            totalMs += durationMs;
            if (hits.size() > testCase.topK()) hits = hits.subList(0, testCase.topK());

            boolean unauthorized = hits.stream().anyMatch(hit ->
                    !testCase.allowedBases().isEmpty()
                            && !testCase.allowedBases().contains(UUID.fromString(hit.knowledgeBaseId())));
            if (unauthorized) {
                authzFailures++;
                results.add(failed(testCase, hits, "UNAUTHORIZED_HIT", durationMs));
                continue;
            }

            if (testCase.expectEmpty() || testCase.kind().equals("empty")) {
                boolean ok = hits.isEmpty();
                if (!ok) emptyFailures++;
                results.add(new CaseResult(testCase.id(), testCase.kind(), ok, 0, 0, null, hits.size(),
                        ok ? "" : "EXPECTED_EMPTY", durationMs));
                continue;
            }

            if (testCase.kind().equals("authz")) {
                // Granted bases must not surface the foreign expected source.
                boolean leaked = hits.stream().anyMatch(hit -> testCase.expectedSources().contains(hit.source()));
                if (leaked) authzFailures++;
                results.add(new CaseResult(testCase.id(), testCase.kind(), !leaked, leaked ? 1 : 0,
                        testCase.expectedSources().size(), null, hits.size(), leaked ? "LEAK" : "", durationMs));
                continue;
            }

            int hitCount = 0;
            Integer best = null;
            for (int i = 0; i < hits.size(); i++) {
                if (testCase.expectedSources().contains(hits.get(i).source())) {
                    hitCount++;
                    if (best == null) best = i + 1;
                }
            }
            boolean passed = hitCount > 0;
            if (testCase.kind().equals("direct") || testCase.kind().equals("identifier")) {
                directTotal++;
                if (passed) directHit++;
            } else if (testCase.kind().equals("chinese")) {
                chineseTotal++;
                if (passed) chineseHit++;
            }
            results.add(new CaseResult(testCase.id(), testCase.kind(), passed, hitCount,
                    testCase.expectedSources().size(), best, hits.size(), passed ? "" : "MISS", durationMs));
        }
        double direct = directTotal == 0 ? 1.0 : (double) directHit / directTotal;
        double chinese = chineseTotal == 0 ? 1.0 : (double) chineseHit / chineseTotal;
        return new Report(metering, List.copyOf(results), direct, chinese, authzFailures, emptyFailures, totalMs);
    }

    private static CaseResult failed(Case testCase, List<Hit> hits, String failure, long durationMs) {
        return new CaseResult(testCase.id(), testCase.kind(), false, 0, testCase.expectedSources().size(),
                null, hits.size(), failure, durationMs);
    }

    /** Predetermined fixture set for the offline keyword probe corpus. */
    public static List<Case> fixtureCases(UUID authorizedBase, UUID foreignBase) {
        Objects.requireNonNull(foreignBase, "foreignBase");
        return List.of(
                new Case("direct-git-status", "direct", "git status 只读工具",
                        Set.of("tools/git-status.md"), Set.of(authorizedBase), DEFAULT_TOP_K, false),
                new Case("identifier-wire-api", "identifier", "wireApi responses protocol",
                        Set.of("models/wire-api.md"), Set.of(authorizedBase), DEFAULT_TOP_K, false),
                new Case("chinese-context-budget", "chinese", "如何配置上下文预算",
                        Set.of("chat/context-budget.md"), Set.of(authorizedBase), DEFAULT_TOP_K, false),
                new Case("synonym-approval", "direct", "拒绝代码提案 refuse proposal",
                        Set.of("chat/proposal-refuse.md"), Set.of(authorizedBase), DEFAULT_TOP_K, false),
                new Case("empty-no-corpus", "empty", "ZZZNOMATCH999TOKEN",
                        Set.of(), Set.of(authorizedBase), DEFAULT_TOP_K, true),
                new Case("authz-foreign-secret", "authz", "foreign secret token",
                        Set.of("secrets/foreign.md"), Set.of(authorizedBase), DEFAULT_TOP_K, false),
                new Case("update-after-edit", "direct", "needle updated-private",
                        Set.of("docs/needle.md"), Set.of(authorizedBase), DEFAULT_TOP_K, false)
        );
    }
}
