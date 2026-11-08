package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import java.net.*;
import java.net.http.*;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ChatGptLoginTest {
    @TempDir Path root;
    private ModelConnections connections() {
        return new ModelConnections(root.resolve("accounts.json"), false, new ModelClientSource() {
            public org.springframework.ai.chat.client.ChatClient conversational(ModelConnectionSnapshot snapshot) { throw new AssertionError("No inference during login"); }
            public org.springframework.ai.chat.client.ChatClient completion(ModelConnectionSnapshot snapshot) { throw new AssertionError("No inference during login"); }
        });
    }
    private static Map<String, String> query(String url) {
        var result = new HashMap<String, String>();
        for (var part : URI.create(url).getRawQuery().split("&")) { var pair = part.split("=", 2); result.put(URLDecoder.decode(pair[0], java.nio.charset.StandardCharsets.UTF_8), URLDecoder.decode(pair[1], java.nio.charset.StandardCharsets.UTF_8)); }
        return result;
    }
    @Test void validatesStatePkceAndSignedIdentityBeforeSavingSeparateAccountCredentials() throws Exception {
        var connections = connections(); var protocol = new TestProtocol();
        try (var login = new AutoCloseLogin(new ChatGptLogin(connections, protocol))) {
            var started = login.value.start(null); var auth = query(started.authorizationUrl()); protocol.nonce = auth.get("nonce"); protocol.challenge = auth.get("code_challenge");
            assertEquals("dynamic_agent_client", auth.get("client_id"));
            assertEquals("S256", auth.get("code_challenge_method"));
            assertTrue(auth.get("redirect_uri").startsWith("http://127.0.0.1:"));
            assertTrue(auth.get("ext_agent_host_id").startsWith("urn:uuid:"));
            var http = HttpClient.newHttpClient();
            String callback = auth.get("redirect_uri") + "?code=test-code&client_id=oaiapp_test&state=";
            assertEquals(400, http.send(HttpRequest.newBuilder(URI.create(callback + "wrong")).build(), HttpResponse.BodyHandlers.discarding()).statusCode());
            assertTrue(connections.list().items().isEmpty());
            assertEquals(200, http.send(HttpRequest.newBuilder(URI.create(callback + auth.get("state"))).build(), HttpResponse.BodyHandlers.discarding()).statusCode());
            var completed = login.value.state(started.loginId()); assertEquals("connected", completed.state());
            var saved = connections.list().items().getFirst();
            assertEquals("chatgpt-plan", saved.kind()); assertTrue(saved.allowedModels().isEmpty()); assertEquals("", saved.defaultModel());
            String view = JsonMapper.builder().build().writeValueAsString(connections.list());
            assertFalse(view.contains("test-access")); assertFalse(view.contains("test-refresh")); assertFalse(view.contains("idToken"));
            assertEquals("oaiapp_test", connections.oauthCredentials(completed.connectionId()).clientId());
            assertEquals(400, http.send(HttpRequest.newBuilder(URI.create(callback + auth.get("state"))).build(), HttpResponse.BodyHandlers.discarding()).statusCode());
            assertEquals(1, protocol.exchanges);
            String host = auth.get("ext_agent_host_id");
            var second = login.value.start(saved.id()); var secondAuth = query(second.authorizationUrl());
            assertEquals("oaiapp_test", secondAuth.get("client_id")); assertEquals(host, secondAuth.get("ext_agent_host_id"));
            assertFalse(secondAuth.containsKey("id_token_hint"));
            login.value.cancel(second.loginId()); assertEquals("cancelled", login.value.state(second.loginId()).state());
            connections.disconnectOAuth(saved.id()); assertFalse(connections.list().items().getFirst().secretPresent());
            assertFalse(Files.readString(root.resolve("accounts.json")).contains("test-refresh"));
        }
    }
    @Test void rejectsWrongAudienceNonceAndExpiryAndDoesNotTreatIdentityAsPlanPermission() throws Exception {
        var protocol = new TestProtocol(); protocol.nonce = "expected";
        assertThrows(ChatGptOAuthProtocol.AuthFailure.class, () -> protocol.verify(protocol.jwt("wrong", "expected", 60), "oaiapp_test", "expected"));
        assertThrows(ChatGptOAuthProtocol.AuthFailure.class, () -> protocol.verify(protocol.jwt("oaiapp_test", "wrong", 60), "oaiapp_test", "expected"));
        assertThrows(ChatGptOAuthProtocol.AuthFailure.class, () -> protocol.verify(protocol.jwt("oaiapp_test", "expected", -60), "oaiapp_test", "expected"));
        var identity = protocol.verify(protocol.jwt("oaiapp_test", "expected", 60), "oaiapp_test", "expected");
        assertFalse(identity.planGranted());
    }
    private record AutoCloseLogin(ChatGptLogin value) implements AutoCloseable { public void close() { value.close(); } }

    @Test void refreshesRotatingTokensWithoutChangingTheRegisteredAccountOrEnablingUnknownModels() {
        var connections = connections(); var id = UUID.randomUUID();
        connections.registerOAuth(id, "oaiapp_test");
        connections.completeOAuth(id, new ChatGptCredentials("oaiapp_test", "user", "user@example.test", "old-id", "old-access", "old-refresh",
                Instant.now().minusSeconds(1), Set.of("resource.invoke", "chatgpt.tokens.use.direct")));
        var protocol = new ChatGptOAuthProtocol() {
            @Override protected JsonNode token(Map<String, String> fields) {
                assertEquals("refresh_token", fields.get("grant_type")); assertEquals("old-refresh", fields.get("refresh_token"));
                return JsonMapper.builder().build().readTree("{\"access_token\":\"new-access\",\"refresh_token\":\"new-refresh\",\"token_type\":\"Bearer\",\"expires_in\":3600}");
            }
        };
        org.springframework.test.util.ReflectionTestUtils.setField(connections, "oauthProtocol", protocol);
        connections.refreshModels(id, new ModelDiscovery() { @Override public List<String> fetch(ModelConnectionSnapshot snapshot) { assertEquals("new-access", snapshot.secret); return List.of("plan-model"); } });
        connections.configureModels(id, List.of(new ModelOption("plan-model", List.of())), List.of("plan-model"), "plan-model");
        assertEquals("new-access", connections.requireModel(id, "plan-model").secret);
        assertEquals("new-refresh", connections.oauthCredentials(id).refreshToken());
        assertEquals("user", connections.oauthCredentials(id).subject());
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> connections.configureModels(id, List.of(new ModelOption("unknown-model", List.of())), List.of("unknown-model"), "unknown-model"));
    }
    private static class TestProtocol extends ChatGptOAuthProtocol {
        final com.nimbusds.jose.jwk.RSAKey key;
        String nonce, challenge; int exchanges;
        TestProtocol() throws Exception { key = new RSAKeyGenerator(2048).keyID("test-key").generate(); }
        String jwt(String audience, String nonce, int lifetime) throws Exception {
            var claims = new JWTClaimsSet.Builder().issuer(ISSUER).subject("test-subject").audience(audience).issueTime(new Date())
                    .expirationTime(Date.from(Instant.now().plusSeconds(lifetime))).claim("nonce", nonce).claim("email", "test@example.test").build();
            var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").build(), claims); jwt.sign(new RSASSASigner(key)); return jwt.serialize();
        }
        @Override protected String get(String url) { return new com.nimbusds.jose.jwk.JWKSet(key.toPublicJWK()).toString(); }
        @Override protected JsonNode token(Map<String, String> fields) {
            try {
                exchanges++; assertEquals(challenge, ChatGptLogin.challenge(fields.get("code_verifier")));
                return JsonMapper.builder().build().readTree(JsonMapper.builder().build().writeValueAsString(Map.of("id_token", jwt(fields.get("client_id"), nonce, 120),
                        "access_token", "test-access", "refresh_token", "test-refresh", "token_type", "Bearer", "expires_in", 3600, "scope", SCOPE)));
            } catch (Exception failure) { throw new AssertionError(failure); }
        }
    }
}
