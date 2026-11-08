package com.lh.eap.skill;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;

class SkillTextParserTest {
    static Map<String,Object> input(String raw) {
        return Map.of("rawSkillMd", raw, "version", "1.0.0", "sourceLabel", "explicit paste",
                "resources", List.of(), "requiredCapabilities", List.of("missing.capability"));
    }
    @Test void rejectsUnsafeYamlAndUnsupportedMetadataWithoutEchoingPayload() {
        for (String yaml : List.of("name: bad--name\ndescription: ok", "name: good\ndescription: true",
                "name: good\ndescription: ok\nname: other", "name: &name good\ndescription: *name",
                "name: !!str good\ndescription: ok", "name: !custom good\ndescription: ok",
                "name: good\ndescription: ok\n<<: {name: other}", "name: good\ndescription: ok\nallowed-tools: bash",
                "name: good\ndescription: ok\nunknown: ignored", "name: good\ndescription: ok\n...\n---\nname: second",
                "name: good\ndescription: ok\nmetadata: {nested: {key: value}}")) {
            var error = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> new SkillTextParser().parse(input("---\n" + yaml + "\n---\nbody"), "scope"), yaml);
            assertTrue(error.getReason().startsWith("INVALID_SKILL_"));
        }
    }
    @Test void validatesEveryPayloadFieldAndRejectsCredentialsInsteadOfRedacting() {
        var base = input("---\nname: good\ndescription: ok\n---\nbody");
        for (var change : List.of(Map.of("rawSkillMd", "---\nname: good\ndescription: ok\n---\napi_key=private"),
                Map.of("rawSkillMd", "x".repeat(16001)), Map.of("version", "01.0.0"), Map.of("scope", "forged"),
                Map.of("sourceLabel", ""), Map.of("requiredCapabilities", List.of("a", "a")))) {
            var bad = new HashMap<String,Object>(base); bad.putAll(change);
            assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new SkillTextParser().parse(bad, "scope"));
        }
    }
    @org.junit.jupiter.params.ParameterizedTest(name = "secret rejected in {0}")
    @org.junit.jupiter.params.provider.ValueSource(strings = {"rawSkillMd", "sourceLabel", "resource"})
    void rejectsBearerAndPrivateKeyTextInEveryImportedTextField(String field) {
        String normal = "---\nname: good\ndescription: ok\n---\nbody\n";
        String credential = "fixture-" + "aB9".repeat(12);
        String keyMaterial = "fixture-" + "not-key-material".repeat(2);
        for (String secret : List.of("Authorization: Bearer " + credential,
                "-----BEGIN PRIVATE KEY-----\n" + keyMaterial + "\n-----END PRIVATE KEY-----",
                "-----BEGIN RSA PRIVATE KEY-----\n" + keyMaterial + "\n-----END RSA PRIVATE KEY-----")) {
            var candidate = new HashMap<String,Object>(input(normal));
            if (field.equals("resource")) candidate.put("resources", List.of(Map.of(
                    "path", "references/probe.md", "mediaType", "text/markdown", "content", secret)));
            else candidate.put(field, field.equals("rawSkillMd") ? normal + secret : secret);
            var error = assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> new SkillTextParser().parse(candidate, "scope"));
            assertEquals(400, error.getStatusCode().value());
            assertEquals("INVALID_SKILL_SECRET", error.getReason());
            assertFalse(error.getMessage().contains(credential));
            assertFalse(error.getMessage().contains(keyMaterial));
        }
    }

    @Test void preservesOrdinaryTaskContextAndCssDesignTokens() {
        String body = "<section class=\"task-context\">mask-image task-state</section>\n"
                + "/* tokens.css */ :root { --color-primary: #123456; --space-unit: 4px; }";
        var candidate = new HashMap<String,Object>(input("---\nname: good\ndescription: ok\n---\n" + body));
        candidate.put("sourceLabel", "task-context and CSS tokens");
        candidate.put("resources", List.of(Map.of("path", "references/tokens.txt", "mediaType", "text/plain", "content", body)));
        var parsed = new SkillTextParser().parse(candidate, "scope");
        assertEquals(body, parsed.instructions());
        assertEquals(body, parsed.resources().getFirst().content());
    }

    @Test void keepsExplicitResourcesAndOptionalMetadataButRejectsUnsafePaths() {
        var base = new HashMap<String,Object>(input("---\nname: good\ndescription: ok\nlicense: MIT\ncompatibility: Local\nmetadata: {author: team}\n---\nbody\n"));
        base.put("resources", List.of(Map.of("path", "references/A.md", "mediaType", "text/markdown", "content", "  original\r\n")));
        var parsed = new SkillTextParser().parse(base, "scope");
        assertEquals("  original\r\n", parsed.resources().getFirst().content());
        String digest = parsed.digest();
        base.put("resources", List.of(Map.of("path", "references/A.md", "mediaType", "text/markdown", "content", "changed")));
        assertNotEquals(digest, new SkillTextParser().parse(base, "scope").digest());
        for (String path : List.of("../a.md", "/a.md", "C:/a.md", "a\\b.md", "scripts/a.md", "a//b.md", "a/./b.md", "a.exe", "a%.md", "文件.md")) {
            base.put("resources", List.of(Map.of("path", path, "mediaType", "text/markdown", "content", "body")));
            assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new SkillTextParser().parse(base, "scope"), path);
        }
        base.put("resources", List.of(Map.of("path", "A.md", "mediaType", "text/markdown", "content", "a"), Map.of("path", "a.md", "mediaType", "text/markdown", "content", "b")));
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new SkillTextParser().parse(base, "scope"));
    }
    @Test void parsesOriginalTextWithoutNormalizingNewlinesAndBindsScopeIntoDigest() throws Exception {
        var parser = new SkillTextParser();
        String raw = "---\r\nname: review-code\r\ndescription: Review code\r\n---\r\n  exact body\r\n";
        var result = parser.parse(input(raw), "scope-a");
        assertEquals(raw, result.rawSkillMd());
        assertEquals("  exact body\r\n", result.instructions());
        assertEquals("review-code", result.id());
        var other = parser.parse(input(raw), "scope-b");
        assertNotEquals(result.digest(), other.digest());
    }
}
