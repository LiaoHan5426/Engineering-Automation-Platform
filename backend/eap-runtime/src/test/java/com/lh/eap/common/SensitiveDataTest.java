package com.lh.eap.common;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class SensitiveDataTest {
    @Test void doesNotTreatTaskAndMaskIdentifiersAsCredentialLiterals() {
        String source = "<section class=\"task-context\">mask-image task-state</section>";
        assertFalse(SensitiveData.containsSecret(source));
        assertEquals(source, SensitiveData.redact(source));
    }
    @Test void rejectsCredentialLiteralsInMethodArguments() {
        String source = "client.apiKey(\"sk-proj-synthetic-test-value\")";
        assertTrue(SensitiveData.containsSecret(source));
        assertFalse(SensitiveData.redact(source).contains("synthetic-test-value"));
    }
}
