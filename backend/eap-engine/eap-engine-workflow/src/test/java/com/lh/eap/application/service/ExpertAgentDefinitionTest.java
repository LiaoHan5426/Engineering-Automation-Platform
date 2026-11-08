package com.lh.eap.application.service;

import com.lh.eap.core.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.rules.RulePackQuery;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ExpertAgentDefinitionTest {
    private final ExpertBehaviorBinding binding = new ExpertBehaviorBinding("sql-readonly-agent", 1);
    private final RulePackQuery rules = mock(RulePackQuery.class);
    private final CapabilitySettings switches = mock(CapabilitySettings.class);
    private final ExpertAnalysisPolicy policy = mock(ExpertAnalysisPolicy.class);
    private final ExpertBehaviorCatalog policies = new ExpertBehaviorCatalog(List.of(new ExpertBehaviorCatalog.Registration(
            binding, "SQL Agent", policy, "agent", Set.of("sql.parse", "database.explain"), Set.of("sql.parse"))), binding);
    private final ExpertDefinitionService service = new ExpertDefinitionService(mock(JdbcTemplate.class), rules, () -> Set.of(), switches, policies);

    @Test void explicitV2AgentRoundTripsWithoutPretendingToolsAreADag() {
        var manifest = manifest("eap/v2", List.of("sql.parse", "database.explain"), List.of());
        assertEquals(manifest, ExpertManifest.parse(ExpertManifest.serialize(manifest)));
        assertTrue(service.validateGraph(manifest).isEmpty());
    }
    @Test void v1CannotSilentlyBecomeAutonomous() {
        assertFalse(service.validateGraph(manifest("eap/v1", List.of("sql.parse"), List.of())).isEmpty());
    }
    @Test void onlyInstalledAllowedEnabledAndRequiredToolsCanBeDeclared() {
        for (var tools : List.of(List.of("database.explain"), List.of("sql.parse", "git-status"), List.of("sql.parse", "execute_sql")))
            assertFalse(service.validateGraph(manifest("eap/v2", tools, List.of())).isEmpty());
        when(switches.disabled()).thenReturn(Set.of("sql.parse"));
        assertFalse(service.validateGraph(manifest("eap/v2", List.of("sql.parse"), List.of())).isEmpty());
    }
    @Test void ruleRequirementsAreEnforcedBeforeActivation() {
        when(rules.requirements(List.of("plan-check"))).thenReturn(Map.of("plan-check", Set.of("database.explain")));
        assertFalse(service.validateGraph(manifest("eap/v2", List.of("sql.parse"), List.of("plan-check"))).isEmpty());
        assertTrue(service.validateGraph(manifest("eap/v2", List.of("sql.parse", "database.explain"), List.of("plan-check"))).isEmpty());
    }
    @Test void legacyWorkflowEndpointCannotExecuteAnAgentBinding() {
        var definitions = mock(ExpertDefinitionService.class);
        when(definitions.require("fixture", true)).thenReturn(manifest("eap/v2", List.of("sql.parse"), List.of()));
        var tasks = mock(com.lh.eap.persistence.mapper.TaskRepository.class);
        var executor = new ExpertExecutionService(definitions, tasks, new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of()),
                policies, java.nio.file.Path.of("."), List.of());
        var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> executor.execute("fixture",
                new ExpertExecutionService.Request("select 1", "Review", null, null, false, null)));
        assertEquals("EXPERT_REQUIRES_AGENT_ENTRY", error.getReason());
        verifyNoInteractions(tasks, policy);
    }
    private ExpertManifest manifest(String version, List<String> tools, List<String> packs) {
        return new ExpertManifest(version, "Expert", "fixture", "Fixture", List.of(), List.of(), List.of(), List.of(),
                List.of("database.credentials.never-expose"), packs, List.of(), binding, new ExpertAgentDefinition("Review supplied evidence", tools));
    }
}
