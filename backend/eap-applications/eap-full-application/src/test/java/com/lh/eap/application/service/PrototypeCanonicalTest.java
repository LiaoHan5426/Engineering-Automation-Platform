package com.lh.eap.application.service;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class PrototypeCanonicalTest {
    private static final String FORM = """
        {"format":"eap-prototype-v1","schema":{"version":1,"title":"Form","grapesProject":{},"unknownMappings":[],
        "root":{"id":"root","kind":"page","props":{},"children":[
          {"id":"form","kind":"form","props":{"label":"Task"},"children":[
            {"id":"name","kind":"input","props":{"required":true},"children":[]},
            {"id":"category","kind":"select","props":{"options":["UI","Feature"],"initialValue":"UI"},"children":[]},
            {"id":"confirmation","kind":"checkbox","props":{"checked":false},"children":[]},
            {"id":"submit","kind":"button","props":{"action":{"type":"SUBMIT","target":"form"}},"children":[]}]},
          {"id":"dialog","kind":"dialog","props":{},"children":[]},
          {"id":"open","kind":"button","props":{"action":{"type":"TOGGLE","target":"dialog"}},"children":[]}
        ]}}}
        """;
    @Test void publishesDeclarativeFormAndDialogActionsAsImmutableDesignContent() {
        var content = PrototypeCanonical.of("builder-alpha","Form",FORM,List.of("Validate and reset"));
        assertDoesNotThrow(() -> SemanticPrototype.require(content.body()));
        var changed = PrototypeCanonical.of("builder-alpha","Form",FORM.replace("\"SUBMIT\"","\"RESET\""),List.of("Validate and reset"));
        assertNotEquals(content.hash(), changed.hash());
    }
    @Test void rejectsAmbiguousIdentityUnsafeActionsAndInvalidFieldContracts() {
        for (var body : List.of(FORM.replace("\"target\":\"form\"", "\"target\":\"missing\""),
                FORM.replace("\"type\":\"SUBMIT\"", "\"type\":\"TOGGLE\""),
                FORM.replace("\"type\":\"SUBMIT\"", "\"type\":\"FETCH\""),
                FORM.replace("\"id\":\"name\"", "\"id\":\"form\""),
                FORM.replace("[\"UI\",\"Feature\"]","[\"UI\",\"UI\"]"),
                FORM.replace("\"initialValue\":\"UI\"", "\"initialValue\":\"missing\""),
                FORM.replace("\"required\":true", "\"required\":\"true\"")))
            assertThrows(IllegalArgumentException.class, () -> SemanticPrototype.require(body));
    }
    @Test void normalizedMetadataAndReopenedDesignKeepTheSameHash() {
        var body=SemanticPrototypeFixture.body("结算页");
        var first=PrototypeCanonical.of("builder-alpha"," 结算页 \r\n",body,List.of(" 看标题 ",""));
        var next=PrototypeCanonical.of("builder-alpha","结算页",body,List.of("看标题"));
        assertEquals(first.hash(),next.hash());
        assertEquals(next.hash(),PrototypeCanonical.of(next.sourceRef(),next.title(),next.body(),next.acceptance()).hash());
        assertFalse(PrototypeCanonical.json(next).contains("buttonPresses"));
        assertFalse(PrototypeCanonical.json(next).contains("interaction"));
    }
    @Test void actualDesignChangesProduceDifferentHashes() {
        var first=PrototypeCanonical.of("builder-alpha","设计",SemanticPrototypeFixture.body("甲"),List.of());
        var next=PrototypeCanonical.of("builder-alpha","设计",SemanticPrototypeFixture.body("乙"),List.of());
        assertNotEquals(first.hash(),next.hash());
    }
    @Test void plainTextUnknownFormatAndUnknownMappingsCannotPublish() {
        for(var body:List.of("text","{}",SemanticPrototypeFixture.body("x").replace("eap-prototype-v1","eap-prototype-v2"),
                SemanticPrototypeFixture.body("x").replace("\"unknownMappings\":[]","\"unknownMappings\":[\"chart\"]"),
                SemanticPrototypeFixture.body("x").replace("\"kind\":\"text\"","\"kind\":\"chart\"")))
            assertThrows(IllegalArgumentException.class,()->PrototypeCanonical.of("builder-alpha","设计",body,List.of()));
    }
    @Test void missingDesignOversizedAndUnsupportedSourceAreRejected() {
        assertThrows(IllegalArgumentException.class,()->PrototypeCanonical.of("builder-alpha","设计"," ",List.of()));
        assertThrows(IllegalArgumentException.class,()->SemanticPrototype.require("x".repeat(160001)));
        assertThrows(IllegalArgumentException.class,()->PrototypeCanonical.of("other","设计",SemanticPrototypeFixture.body("x"),List.of()));
    }
    @Test void redactionPrecedesHashWithoutBreakingSemanticJson() {
        var content=PrototypeCanonical.of("builder-alpha","password='hidden'",SemanticPrototypeFixture.body("design"),List.of("token=secret"));
        assertFalse(PrototypeCanonical.json(content).contains("hidden"));
        assertFalse(content.acceptance().getFirst().contains("secret"));
        assertDoesNotThrow(()->SemanticPrototype.require(content.body()));
    }
}
