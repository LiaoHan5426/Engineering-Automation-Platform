package com.lh.eap.application.service;

import com.lh.eap.core.CapabilityCatalogQuery;
import com.lh.eap.core.ExpertAnalysisPolicy;
import com.lh.eap.core.ExpertAnalysisPolicyResolver;
import com.lh.eap.core.ExpertDefinitionManagementStore;
import com.lh.eap.core.ExpertDefinitionStore;
import com.lh.eap.core.ExpertScopedCapabilityQuery;
import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePackQuery;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ExpertDefinitionCompositionTest {
    private final ExpertDefinitionStore store = mock(ExpertDefinitionStore.class);
    private final RulePackQuery rules = mock(RulePackQuery.class);
    private final CapabilitySettings settings = mock(CapabilitySettings.class);

    @Test void containerUsesSuppliedPortsAndSettingsWithSqlAndMcpImplementationsFiltered() {
        new ApplicationContextRunner()
                .withClassLoader(new FilteredClassLoader("com.lh.eap.runtime.sql", "com.lh.eap.runtime.mcp",
                        "com.lh.eap.rules.RulePackService", "com.lh.eap.rules.SqlFactVocabulary",
                        "com.lh.eap.persistence.mapper.McpServerRegistry"))
                .withUserConfiguration(ExpertDefinitionService.class)
                .withBean(ExpertDefinitionStore.class, () -> store)
                .withBean(RulePackQuery.class, () -> rules)
                .withBean(ExpertScopedCapabilityQuery.class, () -> () -> Set.of())
                .withBean(CapabilitySettings.class, () -> settings)
                .withBean(ExpertAnalysisPolicyResolver.class, () -> new com.lh.eap.core.ExpertBehaviorCatalog(java.util.List.of(new com.lh.eap.core.ExpertBehaviorCatalog.Registration(new com.lh.eap.domain.model.ExpertBehaviorBinding("sql-analysis", 1), "SQL", mock(ExpertAnalysisPolicy.class)))))
                .withBean(CapabilityCatalogQuery.class, CapabilityCatalogQuery::empty)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    when(settings.disabled()).thenReturn(Set.of("git-status"));
                    var errors = context.getBean(ExpertDefinitionService.class)
                            .validateGraph(manifest("git-status", List.of(), List.of()));
                    assertTrue(errors.stream().anyMatch(error -> error.contains("已在平台停用")), errors.toString());
                    verify(settings).disabled();
                    verifyNoInteractions(store);
                });
    }

    @Test void customRuleRequirementsAndAvailabilityAreEnforced() {
        var service = definitions(() -> Set.of());
        when(rules.requirements(List.of("local-review")))
                .thenReturn(Map.of("local-review", Set.of("git-diff")));
        assertTrue(service.validateGraph(manifest("git-status", List.of("local-review"), List.of()))
                .stream().anyMatch(error -> error.contains("git-diff")));
        assertTrue(service.validateRulePackReferences(List.of("local-review"))
                .stream().anyMatch(error -> error.contains("不存在或未启用")));
        when(rules.find("local-review")).thenReturn(Optional.of(new RulePack(
                "eap/v1", "RulePack", "local-review", "Local review", 1, "", null, List.of(), null)));
        assertTrue(service.validateRulePackReferences(List.of("local-review")).isEmpty());
        assertTrue(service.validateGraph(manifest("git-diff", List.of("local-review"), List.of())).isEmpty());
    }

    @Test void scopedPublicationAndDeclarationAreBothRequiredAndRevocationIsLive() {
        String capability = "mcp.docs.read";
        var published = new AtomicReference<>(Set.of(capability));
        var service = definitions(published::get);
        assertFalse(service.validateGraph(manifest(capability, List.of(), List.of())).isEmpty());
        var authorized = manifest(capability, List.of(), List.of(capability));
        assertTrue(service.validateGraph(authorized).isEmpty());
        published.set(Set.of());
        assertFalse(service.validateGraph(authorized).isEmpty());
    }

    @Test void activationRejectsInvalidPolicyBeforeWritingGrantsButDisableStillRevokes() {
        var manifest = manifest("git-status", List.of(), List.of());
        when(store.lock("local-expert")).thenReturn(Optional.of(new ExpertDefinitionStore.Definition(
                ExpertManifest.serialize(manifest), false, false)));
        when(settings.disabled()).thenReturn(Set.of("git-status"));
        var service = definitions(() -> Set.of());
        assertThrows(ResponseStatusException.class, () -> service.activate("local-expert", true));
        verify(store, never()).replaceGrants(anyString(), anyList(), anyList(), anyList());
        verify(store, never()).setEnabled(anyString(), anyBoolean());
        clearInvocations(rules, settings);
        service.activate("local-expert", false);
        verify(store).replaceGrants("local-expert", List.of(), List.of(), List.of());
        verify(store).setEnabled("local-expert", false);
        verifyNoInteractions(rules, settings);
    }

    @Test void editorCatalogUsesTheSelectedRuleDomainFacts() {
        var facts = List.of(new RulePackQuery.Fact("local.changed", "boolean", "Local", "Changed files", "git-diff"));
        var packs = List.<Map<String, Object>>of(Map.of("id", "local-review", "enabled", true));
        when(rules.facts()).thenReturn(facts);
        when(rules.catalog()).thenReturn(packs);
        var capabilities = mock(CapabilityCatalog.class);
        when(capabilities.catalog()).thenReturn(Map.of());
        var service = new ExpertManagementService(mock(ExpertDefinitionManagementStore.class),
                definitions(() -> Set.of()), rules, capabilities);
        var result = service.catalog();
        assertEquals(facts, result.get("facts"));
        assertEquals(packs, result.get("rulePacks"));
    }

    private ExpertDefinitionService definitions(ExpertScopedCapabilityQuery scoped) {
        return new ExpertDefinitionService(store, rules, scoped, settings, new com.lh.eap.core.ExpertBehaviorCatalog(java.util.List.of(new com.lh.eap.core.ExpertBehaviorCatalog.Registration(new com.lh.eap.domain.model.ExpertBehaviorBinding("sql-analysis", 1), "SQL", mock(ExpertAnalysisPolicy.class)))));
    }

    private static ExpertManifest manifest(String capability, List<String> packs, List<String> tools) {
        return new ExpertManifest("eap/v1", "Expert", "local-expert", "Local expert", List.of(), List.of(),
                List.of(new ExpertManifest.Step("inspect", "Inspect", capability, true)), List.of(),
                List.of("database.credentials.never-expose"), packs, tools, new com.lh.eap.domain.model.ExpertBehaviorBinding("sql-analysis", 1));
    }
}
