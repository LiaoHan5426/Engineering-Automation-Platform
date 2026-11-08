package com.lh.eap.core;

import com.lh.eap.domain.model.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.rules.RulePack;

class ExpertBehaviorCatalogTest {
    private final ExpertBehaviorBinding v1 = new ExpertBehaviorBinding("sql-analysis", 1);
    private final ExpertBehaviorBinding v2 = new ExpertBehaviorBinding("sql-analysis", 2);
    private final ExpertAnalysisPolicy first = new UnusedPolicy();
    private final ExpertAnalysisPolicy second = new UnusedPolicy();

    @Test void persistedBindingChoosesExactVersionAndLegacyUsesOnlyExplicitDefault() {
        var catalog = new ExpertBehaviorCatalog(List.of(
                new ExpertBehaviorCatalog.Registration(v1, "SQL v1", first),
                new ExpertBehaviorCatalog.Registration(v2, "SQL v2", second)), v1);
        assertSame(first, catalog.resolve(manifest(null)).orElseThrow());
        var restored = ExpertManifest.parse(ExpertManifest.serialize(manifest(v2)));
        assertSame(second, catalog.resolve(restored).orElseThrow());
        assertTrue(catalog.resolve(manifest(new ExpertBehaviorBinding("sql-analysis", 3))).isEmpty());
        assertTrue(catalog.resolve(manifest(new ExpertBehaviorBinding("other", 1))).isEmpty());
        assertEquals(List.of("fixed-workflow", "fixed-workflow"), catalog.behaviors().stream()
                .map(ExpertBehaviorCatalog.Descriptor::executionMode).toList());
    }

    @Test void compositionRejectsDuplicateBindingsAndMissingLegacyVersion() {
        var registration = new ExpertBehaviorCatalog.Registration(v1, "SQL", first);
        assertThrows(IllegalArgumentException.class, () -> new ExpertBehaviorCatalog(List.of(registration, registration), v1));
        assertThrows(IllegalArgumentException.class, () -> new ExpertBehaviorCatalog(List.of(registration), v2));
    }

    @Test void malformedExplicitBindingsNeverBecomeLegacyDefinitions() {
        for (var binding : List.of("null", "{}", "[]", "\"sql-analysis\"",
                "{\"id\":\"sql-analysis\",\"version\":\"1\"}",
                "{\"id\":\"sql-analysis\",\"version\":1.5}",
                "{\"id\":\"sql-analysis\",\"version\":0}",
                "{\"id\":\"../sql\",\"version\":1}",
                "{\"id\":\"sql-analysis\",\"version\":2147483648}",
                "{\"id\":\"sql-analysis\",\"version\":1,\"class\":\"untrusted\"}")) {
            assertThrows(RuntimeException.class, () -> ExpertManifest.parse("{\"behavior\":" + binding + "}"), binding);
        }
    }

    @Test void legacySerializationOmitsBindingAndFixedResolverCannotIgnoreExplicitVersions() {
        var json = ExpertManifest.serialize(manifest(null));
        assertFalse(json.contains("behavior"));
        assertNull(ExpertManifest.parse(json).behavior());
        var fixed = ExpertAnalysisPolicyResolver.fixed(first);
        assertTrue(fixed.resolve(manifest(v1)).isEmpty());
        assertSame(first, fixed.resolve(manifest(null)).orElseThrow());
    }

    private static class UnusedPolicy implements ExpertAnalysisPolicy {
        public Rules rules(List<String> ids) { throw new AssertionError("No execution during selection"); }
        public Set<String> allowedFacts() { throw new AssertionError("No execution during selection"); }
        public Map<String,Object> judge(Map<String,Object> analysis, List<RulePack> rules, Set<String> capabilities) { throw new AssertionError("No execution during selection"); }
        public List<Map<String,Object>> summarize(List<RulePack> rules) { throw new AssertionError("No execution during selection"); }
        public Enhancement enhance(Evidence evidence, boolean failed, boolean requested) { throw new AssertionError("No execution during selection"); }
    }

    private ExpertManifest manifest(ExpertBehaviorBinding binding) {
        return new ExpertManifest("eap/v1", "Expert", "fixture", "Fixture", List.of(), List.of(),
                List.of(), List.of(), List.of(), List.of(), List.of(), binding);
    }
}
