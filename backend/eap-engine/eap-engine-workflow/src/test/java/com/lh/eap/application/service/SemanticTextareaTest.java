package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

/** Multiline fields use the existing field props and immutable publication path. */
class SemanticTextareaTest {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String BODY = """
        {"format":"eap-prototype-v1","schema":{"version":1,"title":"Form","grapesProject":{},"unknownMappings":[],
        "root":{"id":"root","kind":"page","props":{},"children":[
          {"id":"form","kind":"form","props":{},"children":[
            {"id":"description","kind":"textarea","props":{"label":"说明","placeholder":"填写说明","initialValue":"第一行说明\\n第二行说明","required":true},"children":[]},
            {"id":"submit","kind":"button","props":{"action":{"type":"SUBMIT","target":"form"}},"children":[]},
            {"id":"reset","kind":"button","props":{"action":{"type":"RESET","target":"form"}},"children":[]}
          ]}]}}}
        """;

    @Test void multilineFieldSurvivesPublicationReadbackAndHashesDistinctlyFromSingleLineInput() {
        var store = new PrototypePublicationServiceTest.Store();
        var service = new PrototypeVersionService(store, null);
        var version = service.save(UUID.randomUUID(), "builder-alpha", "Form", BODY, List.of("Validate and reset"));
        var reopened = service.find(version.id());
        assertEquals(version, reopened);
        assertEquals(BODY.strip(), reopened.body());
        var field = JSON.readTree(reopened.body()).path("schema").path("root").path("children").get(0).path("children").get(0);
        assertEquals("textarea", field.path("kind").asString());
        assertEquals("第一行说明\n第二行说明", field.path("props").path("initialValue").asString());
        assertTrue(field.path("props").path("required").asBoolean());
        assertEquals(version.contentHash(), PrototypeCanonical.of(reopened.sourceRef(), reopened.title(), reopened.body(), reopened.acceptance()).hash());
        assertNotEquals(version.contentHash(), PrototypeCanonical.of("builder-alpha", "Form", BODY.replace("textarea", "input"), version.acceptance()).hash());
        assertNotEquals(version.contentHash(), PrototypeCanonical.of("builder-alpha", "Form", BODY.replace("第二行说明", "另一行说明"), version.acceptance()).hash());
    }

    @Test void requiredEmptyDraftCanPublishButMalformedFieldPropsAndUnknownKindsStayBlocked() {
        assertDoesNotThrow(() -> SemanticPrototype.require(BODY.replace("第一行说明\\n第二行说明", "")));
        for (var invalid : List.of(
                BODY.replace("\"required\":true", "\"required\":\"true\""),
                BODY.replace("\"initialValue\":\"第一行说明\\n第二行说明\"", "\"initialValue\":42"),
                BODY.replace("第一行说明\\n第二行说明", "x".repeat(2001)),
                BODY.replace("\"kind\":\"textarea\"", "\"kind\":\"multiline\""))) {
            var failure = assertThrows(IllegalArgumentException.class, () -> SemanticPrototype.require(invalid));
            assertEquals("PROTOTYPE_SEMANTIC_DESIGN_REQUIRED", failure.getMessage());
        }
    }
}
