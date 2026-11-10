package com.lh.eap.application.service;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class PrototypeCanonicalTest {
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
