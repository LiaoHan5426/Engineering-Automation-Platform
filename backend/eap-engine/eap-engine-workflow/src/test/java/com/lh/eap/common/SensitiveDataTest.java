package com.lh.eap.common;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class SensitiveDataTest {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {
            "const token = epoch; if (token === epoch) refresh();",
            "let token = epoch; if (token == epoch) refresh();",
            "var token = epoch; if (token !== epoch) refresh();"})
    void sourceReferencesAreNotCredentialLiteralsButTextRedactionStaysConservative(String source) {
        assertFalse(SensitiveData.containsSecretInSource(source));
        assertTrue(SensitiveData.containsSecret(source));
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"token=epoch", "const token = 'epoch';",
            "const token = 12345;", "const token = epoch + suffix;", "token === 'secret-value'", "token === epoch suffix",
            "const token = sk; // sk-proj-synthetic-credential", "jdbc:postgresql://fixture/db",
            "Authorization: Bearer fixture-credential", "-----BEGIN PRIVATE KEY-----fixture"})
    void ambiguousAssignmentsAndExplicitSignaturesStillBlockSource(String source) {
        assertTrue(SensitiveData.containsSecretInSource(source));
    }

    @Test void doesNotTreatTaskAndMaskIdentifiersAsCredentialLiterals() {
        String source = "<section class=\"task-context\">mask-image task-state</section>";
        assertFalse(SensitiveData.containsSecret(source));
        assertEquals(source, SensitiveData.redact(source));
    }
    @org.junit.jupiter.params.ParameterizedTest(name = "authorization form {index}")
    @org.junit.jupiter.params.provider.ValueSource(strings = {"Authorization: Bearer ", "authorization: bearer\t",
            "AUTHORIZATION = 'BEARER ", "\"Authorization\": \"Bearer ", "Proxy-Authorization: Bearer "})
    void detectsAndRedactsBearerCredentialsUsingTheSameRule(String prefix) {
        String credential = "fixture-" + "aB9._~+/-".repeat(4) + "==";
        String source = prefix + credential + "\"\nnext line";
        assertTrue(SensitiveData.containsSecret(source));
        assertTrue(SensitiveData.containsSecret(java.util.Map.of("observations", java.util.List.of(source))));
        String safe = SensitiveData.redact(source);
        assertFalse(safe.contains(credential));
        assertTrue(safe.contains("next line"));
    }

    @org.junit.jupiter.params.ParameterizedTest(name = "private key envelope {index}")
    @org.junit.jupiter.params.provider.ValueSource(strings = {"PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY",
            "DSA PRIVATE KEY", "OPENSSH PRIVATE KEY", "ENCRYPTED PRIVATE KEY"})
    void detectsAndRedactsPrivateKeyEnvelopesIncludingTruncatedOutput(String label) {
        String material = "fixture-" + "not-key-material".repeat(2);
        String beginning = "-----BEGIN " + label + "-----\n";
        String block = beginning + material + "\n-----END " + label + "-----";
        for (String source : java.util.List.of(block, beginning + material, beginning,
                block.replace("\n", "\\n"))) {
            assertTrue(SensitiveData.containsSecret(source));
            assertFalse(SensitiveData.redact(source).contains(material));
            assertFalse(SensitiveData.redact(source).contains("-----BEGIN"));
        }
        assertEquals("before\n[REDACTED PRIVATE KEY]\nafter", SensitiveData.redact("before\n" + block + "\nafter"));
    }

    @Test void detectsStructuredAuthorizationValuesAsWellAsTheirSerializedForm() {
        String credential = "fixture-" + "aB9".repeat(12);
        var headers = java.util.Map.of("Authorization", "Bearer " + credential);
        var metadata = java.util.Map.of("headers", java.util.List.of(headers));
        assertTrue(SensitiveData.containsSecret(metadata));
        String serialized = tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(metadata);
        assertTrue(SensitiveData.containsSecret(serialized));
        assertFalse(SensitiveData.redact(serialized).contains(credential));
        assertFalse(SensitiveData.containsSecret(java.util.Map.of("Authorization", "Bearer [REDACTED]")));
        assertFalse(SensitiveData.containsSecret(java.util.Map.of("source", "tokens.css", "class", "task-context")));
    }

    @Test void preservesDesignTokensAndPublicKeyDocumentation() {
        String source = "<section class=\"task-context\">mask-image task-state</section>\n"
                + "/* tokens.css */ :root { --color-primary: #123456; --space-unit: 4px; }\n"
                + "-----BEGIN PUBLIC KEY-----\npublic fixture\n-----END PUBLIC KEY-----";
        assertFalse(SensitiveData.containsSecret(source));
        assertEquals(source, SensitiveData.redact(source));
    }

    @Test void rejectsCredentialLiteralsInMethodArguments() {
        String source = "client.apiKey(\"sk-proj-synthetic-test-value\")";
        assertTrue(SensitiveData.containsSecret(source));
        assertFalse(SensitiveData.redact(source).contains("synthetic-test-value"));
    }
}
