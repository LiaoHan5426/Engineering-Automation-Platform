package com.lh.eap.application.service;

import com.lh.eap.application.dto.ExpertDefinitionRequest;
import com.lh.eap.core.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.ExpertDefinitionMapper;
import com.lh.eap.rules.RulePackQuery;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ExpertBehaviorManagementTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final ExpertBehaviorBinding v1 = new ExpertBehaviorBinding("sql-analysis", 1);
    private final ExpertBehaviorBinding v2 = new ExpertBehaviorBinding("local-review", 2);
    private final ExpertBehaviorCatalog policies = new ExpertBehaviorCatalog(List.of(
            new ExpertBehaviorCatalog.Registration(v1, "SQL", mock(ExpertAnalysisPolicy.class)),
            new ExpertBehaviorCatalog.Registration(v2, "Local", mock(ExpertAnalysisPolicy.class))), v1);
    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ExpertDefinitionMapper mapper = mock(ExpertDefinitionMapper.class);
    private final RulePackQuery rules = mock(RulePackQuery.class);
    private final CapabilityCatalog capabilities = mock(CapabilityCatalog.class);
    private final ExpertDefinitionService definitions = new ExpertDefinitionService(jdbc, rules,
            () -> Set.of(), mock(CapabilitySettings.class), policies);
    private final ExpertManagementService service = new ExpertManagementService(mapper, definitions, rules, capabilities);

    @Test void firstLegacySavePinsDefaultWithoutDroppingEditorMetadata() {
        when(mapper.saveDraft(anyString(), anyString(), anyString(), anyBoolean())).thenAnswer(call -> call.getArgument(2));
        assertEquals(v1, service.save(request(null)).get("behavior"));
        verify(mapper).saveDraft(eq("fixture"), eq("Fixture"), argThat(json ->
                ExpertManifest.parse(json).behavior().equals(v1)
                        && JSON.readTree(json).path("editorLayout").path("x").asInt() == 17), eq(true));
    }

    @Test void omittedBindingRetainsSavedCustomVersionAndExplicitBindingCanReplaceIt() {
        when(mapper.findManifest("fixture")).thenReturn(Optional.of(request(v2).manifest()));
        when(mapper.saveDraft(anyString(), anyString(), anyString(), anyBoolean())).thenAnswer(call -> call.getArgument(2));
        assertEquals(v2, service.save(request(null)).get("behavior"));
        assertEquals(v1, service.save(request(v1)).get("behavior"));
        verify(mapper).saveDraft(eq("fixture"), eq("Fixture"), anyString(), eq(false));
    }

    @Test void unknownBehaviorOrVersionCannotBeSavedOrEnabled() {
        for (var binding : List.of(new ExpertBehaviorBinding("unknown", 1), new ExpertBehaviorBinding("sql-analysis", 99))) {
            var request = request(binding);
            assertEquals(false, service.validate(request).get("valid"));
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.save(request)).getStatusCode().value());
            when(jdbc.queryForList(anyString(), eq("fixture"))).thenReturn(List.of(Map.of("manifest", request.manifest(), "builtin", false)));
            assertThrows(ResponseStatusException.class, () -> definitions.activate("fixture", true));
        }
        verify(mapper, never()).saveDraft(anyString(), anyString(), anyString(), anyBoolean());
        assertTrue(mockingDetails(jdbc).getInvocations().stream().noneMatch(call -> call.getMethod().getName().equals("update")));
        definitions.activate("fixture", false);
        verify(jdbc).update("DELETE FROM eap.expert_mcp_grant WHERE expert_id=?", "fixture");
    }

    @Test void explicitNullDoesNotResetBehaviorAndMalformedStoredBehaviorCanStillBeDisabled() {
        var raw = request(null).manifest().replace("\"editorLayout\"", "\"behavior\":null,\"editorLayout\"");
        var request = new ExpertDefinitionRequest("fixture", "Fixture", raw);
        assertEquals(false, service.validate(request).get("valid"));
        assertThrows(ResponseStatusException.class, () -> service.save(request));
        when(jdbc.queryForList(anyString(), eq("fixture"))).thenReturn(List.of(Map.of("manifest", raw, "builtin", false)));
        definitions.activate("fixture", false);
        verify(jdbc).update("DELETE FROM eap.expert_knowledge_grant WHERE expert_id=?", "fixture");
    }

    @Test void managementCatalogPublishesInstalledVersionedBehaviors() {
        when(capabilities.catalog()).thenReturn(Map.of());
        var catalog = service.catalog();
        assertEquals(policies.behaviors(), catalog.get("behaviors"));
        assertEquals(v1, catalog.get("legacyBehavior"));
    }

    private ExpertDefinitionRequest request(ExpertBehaviorBinding binding) {
        var manifest = new ExpertManifest("eap/v1", "Expert", "fixture", "Fixture", List.of(), List.of(),
                List.of(new ExpertManifest.Step("inspect", "Inspect", "git-status", true)), List.of(),
                List.of("database.credentials.never-expose"), List.of(), List.of(), binding);
        var root = (tools.jackson.databind.node.ObjectNode) JSON.readTree(ExpertManifest.serialize(manifest));
        root.putObject("editorLayout").put("x", 17);
        return new ExpertDefinitionRequest("fixture", "Fixture", JSON.writeValueAsString(root));
    }
}
