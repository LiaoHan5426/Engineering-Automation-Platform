package com.lh.eap.application.service;

import com.lh.eap.application.dto.ExpertDefinitionRequest;
import com.lh.eap.core.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.rules.RulePackQuery;
import java.util.*;
import org.junit.jupiter.api.Test;
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
            new ExpertBehaviorCatalog.Registration(v2, "Local", mock(ExpertAnalysisPolicy.class))));
    private final ExpertDefinitionStore store = mock(ExpertDefinitionStore.class);
    private final ExpertDefinitionManagementStore mapper = mock(ExpertDefinitionManagementStore.class);
    private final RulePackQuery rules = mock(RulePackQuery.class);
    private final CapabilityCatalog capabilities = mock(CapabilityCatalog.class);
    private final ExpertDefinitionService definitions = new ExpertDefinitionService(store, rules,
            () -> Set.of(), mock(CapabilitySettings.class), policies);
    private final ExpertManagementService service = new ExpertManagementService(mapper, definitions, rules, capabilities);

    @Test void explicitSavePreservesMetadataAndMissingBindingNeverWrites() {
        when(mapper.saveDraft(anyString(), anyString(), anyString())).thenAnswer(call -> call.getArgument(2));
        assertEquals(v2, service.save(request(v2)).get("behavior"));
        verify(mapper).saveDraft(eq("fixture"), eq("Fixture"), argThat(json ->
                ExpertManifest.parse(json).behavior().equals(v2)
                        && JSON.readTree(json).path("editorLayout").path("x").asInt() == 17));
        clearInvocations(mapper);
        assertEquals(false, service.validate(request(null)).get("valid"));
        assertThrows(ResponseStatusException.class, () -> service.save(request(null)));
        verifyNoInteractions(mapper);
    }

    @Test void unknownBehaviorOrVersionCannotBeSavedOrEnabled() {
        for (var binding : List.of(new ExpertBehaviorBinding("unknown", 1), new ExpertBehaviorBinding("sql-analysis", 99))) {
            var request = request(binding);
            assertEquals(false, service.validate(request).get("valid"));
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.save(request)).getStatusCode().value());
            when(store.lock("fixture")).thenReturn(Optional.of(new ExpertDefinitionStore.Definition(request.manifest(), false, false)));
            assertThrows(ResponseStatusException.class, () -> definitions.activate("fixture", true));
        }
        verify(mapper, never()).saveDraft(anyString(), anyString(), anyString());
        verify(store, never()).replaceGrants(anyString(), anyList(), anyList(), anyList());
        verify(store, never()).setEnabled(anyString(), anyBoolean());
        definitions.activate("fixture", false);
        verify(store).replaceGrants("fixture", List.of(), List.of(), List.of());
        verify(store).setEnabled("fixture", false);
    }

    @Test void explicitNullDoesNotResetBehaviorAndMalformedStoredBehaviorCanStillBeDisabled() {
        var raw = request(null).manifest().replace("\"editorLayout\"", "\"behavior\":null,\"editorLayout\"");
        var request = new ExpertDefinitionRequest("fixture", "Fixture", raw);
        assertEquals(false, service.validate(request).get("valid"));
        assertThrows(ResponseStatusException.class, () -> service.save(request));
        when(store.lock("fixture")).thenReturn(Optional.of(new ExpertDefinitionStore.Definition(raw, false, false)));
        definitions.activate("fixture", false);
        verify(store).replaceGrants("fixture", List.of(), List.of(), List.of());
        verify(store).setEnabled("fixture", false);
    }

    @Test void managementCatalogPublishesInstalledVersionedBehaviors() {
        when(capabilities.catalog()).thenReturn(Map.of());
        var catalog = service.catalog();
        assertEquals(policies.behaviors(), catalog.get("behaviors"));
        assertFalse(catalog.containsKey("legacyBehavior"));
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
