package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class BoardVerificationSourceTest {
    @TempDir Path repo;
    @Test void includesDesignTokensAndBindsTheirChangesButExcludesAuthenticationTokens() throws Exception {
        var styles = Files.createDirectories(repo.resolve("frontend/packages/style/src"));
        Files.writeString(styles.resolve("tokens.css"), ":root { --color: red; }");
        Files.writeString(styles.resolve("auth-token.json"), "excluded");
        var source = new BoardVerificationSource();
        var before = source.snapshot(repo);
        assertEquals(List.of("frontend/packages/style/src/tokens.css"), before.files().stream().map(BoardVerificationSource.File::path).toList());
        Files.writeString(styles.resolve("tokens.css"), ":root { --color: blue; }");
        assertNotEquals(before.contentHash(), source.snapshot(repo).contentHash());
    }
    @Test void excludesKeyAndCertificateContainersEvenWhenTheyUseJsonExtension() throws Exception {
        Files.createDirectories(repo.resolve("frontend"));
        for (var name : new String[]{"api-key.json", "apikey.json", "client-certificate.json", "keystore.json"}) Files.writeString(repo.resolve("frontend").resolve(name), "not source");
        assertTrue(new BoardVerificationSource().snapshot(repo).files().isEmpty());
    }
    @Test void refusesOversizeSourcesRatherThanReturningPartialEvidence() throws Exception {
        Files.createDirectories(repo.resolve("frontend")); Files.write(repo.resolve("frontend/oversize.ts"), new byte[4 * 1024 * 1024 + 1]);
        var error = assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new BoardVerificationSource().snapshot(repo));
        assertEquals("BOARD_VERIFICATION_SOURCE_LIMIT", error.getReason());
    }
    @Test void rejectsLinksWithoutFollowingTheirTargets() throws Exception {
        Files.createDirectories(repo.resolve("frontend")); var target = Files.writeString(repo.resolve("outside.ts"), "outside scope");
        try { Files.createSymbolicLink(repo.resolve("frontend/link.ts"), target); }
        catch (java.io.IOException | UnsupportedOperationException unavailable) { org.junit.jupiter.api.Assumptions.abort("OS does not permit symlink fixture"); }
        assertEquals("BOARD_VERIFICATION_SOURCE_LINK", assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> new BoardVerificationSource().snapshot(repo)).getReason());
    }
    @Test void capturesUntrackedFrontendSourcesButNeverSecretsOrGeneratedFiles() throws Exception {
        var frontend = Files.createDirectories(repo.resolve("frontend/src"));
        Files.writeString(frontend.resolve("App.vue"), "<template>source</template>");
        Files.writeString(repo.resolve("frontend/package.json"), "{}");
        for (var name : new String[]{".env", "application.yml", "private.key", "credentials.json", "generated.tsbuildinfo"})
            Files.writeString(repo.resolve("frontend").resolve(name), "excluded");
        Files.createDirectories(repo.resolve("frontend/node_modules/dependency"));
        Files.writeString(repo.resolve("frontend/node_modules/dependency/index.js"), "generated");
        var type = assertDoesNotThrow(() -> Class.forName("com.lh.eap.application.service.BoardVerificationSource"), "bounded source implementation is missing");
        var source = type.getMethod("snapshot", Path.class).invoke(type.getConstructor().newInstance(), repo);
        var tree = JsonMapper.builder().build().valueToTree(source);
        assertEquals("frontend", tree.get("scope").asText());
        assertEquals(2, tree.get("files").size());
        assertEquals("frontend/package.json", tree.get("files").get(0).get("path").asText());
        assertEquals("frontend/src/App.vue", tree.get("files").get(1).get("path").asText());
        assertTrue(tree.get("contentHash").asText().matches("[a-f0-9]{64}"));
        assertFalse(tree.toString().contains("<template>"));
        assertFalse(tree.get("exclusions").isEmpty());
    }
}
