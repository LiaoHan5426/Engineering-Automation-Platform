package com.lh.eap.application.retrieval;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.persistence.mapper.KnowledgeRepository;
import java.util.List;
import org.junit.jupiter.api.Test;

class KnowledgeExcerptTest {
    @Test void includesTheMatchNearTheEndOfAChunk() {
        String text = "x".repeat(1350) + " target-evidence " + "y".repeat(130);
        String excerpt = KnowledgeRepository.excerpt(text, List.of("target"));
        assertTrue(excerpt.contains("target-evidence"));
        assertTrue(excerpt.length() <= 1200);
    }
    @Test void redactsTheEntireCredentialBeforeChoosingAnExcerptBoundary() {
        String text = "x".repeat(1185) + " password=boundarycredential" + "z".repeat(300);
        String excerpt = KnowledgeRepository.excerpt(text, List.of());
        assertFalse(excerpt.contains("boundarycredential"));
        assertFalse(excerpt.contains("password=bound"));
    }
    @Test void doesNotSplitSurrogatePairsAndPreservesShortText() {
        assertEquals("Short evidence", KnowledgeRepository.excerpt("Short evidence", List.of("evidence")));
        String text = "x".repeat(299) + "😀" + "x".repeat(1000) + " evidence";
        String excerpt = KnowledgeRepository.excerpt(text, List.of("evidence"));
        assertFalse(Character.isLowSurrogate(excerpt.charAt(0)));
        assertFalse(Character.isHighSurrogate(excerpt.charAt(excerpt.length()-1)));
        assertTrue(excerpt.contains("evidence"));
    }
}
