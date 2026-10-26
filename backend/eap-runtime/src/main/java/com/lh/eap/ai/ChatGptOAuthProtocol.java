package com.lh.eap.ai;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jwt.SignedJWT;

import java.io.Serial;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Official public-client SIWC flow. No borrowed Codex client IDs or private backend-api routes. */
@Component
public class ChatGptOAuthProtocol {
    static final String ISSUER = "https://auth.openai.com";
    static final String RESOURCE = "https://api.openai.com/v1";
    static final String SCOPE = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    private final JsonMapper json = JsonMapper.builder().build();

    static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    static String form(Map<String, String> fields) {
        return fields.entrySet().stream().map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue())).collect(java.util.stream.Collectors.joining("&"));
    }
    String authorize(String host, String state, String nonce, String challenge, String callback, ChatGptCredentials previous) {
        var fields = new LinkedHashMap<String, String>();
        fields.put("client_id", previous == null ? "dynamic_agent_client" : previous.clientId());
        if (previous == null) fields.put("agent_name_hint", "Engineering Automation Platform");
        fields.put("ext_agent_host_id", host); fields.put("response_type", "code"); fields.put("redirect_uri", callback);
        fields.put("scope", SCOPE); fields.put("resource", RESOURCE); fields.put("state", state); fields.put("nonce", nonce);
        fields.put("code_challenge_method", "S256"); fields.put("code_challenge", challenge);
        return ISSUER + "/api/accounts/authorize?" + form(fields);
    }

    ChatGptCredentials exchange(String code, String client, String verifier, String callback, String nonce, ChatGptCredentials previous) {
        var result = token(Map.of("grant_type", "authorization_code", "client_id", client, "code", code,
                "code_verifier", verifier, "redirect_uri", callback, "resource", RESOURCE));
        var identity = verify(result.path("id_token").asString(""), client, nonce);
        if (previous != null && !previous.subject().isBlank() && !previous.subject().equals(identity.subject())) throw failure("CHATGPT_ACCOUNT_MISMATCH");
        return credentials(result, client, identity, null);
    }

    ChatGptCredentials refresh(ChatGptCredentials previous) {
        if (previous.refreshToken() == null || previous.refreshToken().isBlank()) throw failure("CHATGPT_REAUTH_REQUIRED");
        var result = token(Map.of("grant_type", "refresh_token", "client_id", previous.clientId(),
                "refresh_token", previous.refreshToken(), "resource", RESOURCE));
        // Refresh responses need not return an ID token. Keep the previously verified identity and registration.
        if (!result.path("id_token").asString("").isBlank()) {
            var identity = verify(result.path("id_token").asString(), previous.clientId(), null);
            if (!identity.subject().equals(previous.subject())) throw failure("CHATGPT_ACCOUNT_MISMATCH");
        }
        return credentials(result, previous.clientId(), previous, previous);
    }

    private ChatGptCredentials credentials(JsonNode result, String client, ChatGptCredentials identity, ChatGptCredentials previous) {
        String access = result.path("access_token").asString("");
        String refresh = result.path("refresh_token").asString(previous == null ? "" : previous.refreshToken());
        String scope = result.path("scope").asString("");
        long lifetime = result.path("expires_in").asLong(0);
        if (access.isBlank() || access.length() > 16000 || access.indexOf('\r') >= 0 || access.indexOf('\n') >= 0
                || !"bearer".equalsIgnoreCase(result.path("token_type").asString()) || lifetime <= 0 || lifetime > 604800)
            throw failure("CHATGPT_TOKEN_INVALID");
        Set<String> scopes = scope.isBlank() && previous != null ? previous.scopes() : Set.copyOf(Arrays.asList(scope.trim().split(" +")));
        return new ChatGptCredentials(client, identity.subject(), identity.email(), result.path("id_token").asString(identity.idToken()),
                access, refresh, Instant.now().plusSeconds(lifetime), scopes);
    }

    record Identity(String subject, String email) {}
    ChatGptCredentials verify(String raw, String client, String nonce) {
        try {
            var jwt = SignedJWT.parse(raw);
            if (!JWSAlgorithm.RS256.equals(jwt.getHeader().getAlgorithm())) throw failure("CHATGPT_IDENTITY_INVALID");
            var keys = JWKSet.parse(get(ISSUER + "/.well-known/jwks.json"));
            if (!(keys.getKeyByKeyId(jwt.getHeader().getKeyID()) instanceof RSAKey key) || !jwt.verify(new RSASSAVerifier(key)))
                throw failure("CHATGPT_IDENTITY_INVALID");
            var claims = jwt.getJWTClaimsSet(); var now = Instant.now();
            if (!ISSUER.equals(claims.getIssuer()) || !claims.getAudience().contains(client)
                    || claims.getExpirationTime() == null || claims.getExpirationTime().toInstant().isBefore(now.minusSeconds(5))
                    || claims.getIssueTime() == null || claims.getIssueTime().toInstant().isAfter(now.plusSeconds(5))
                    || (claims.getNotBeforeTime() != null && claims.getNotBeforeTime().toInstant().isAfter(now.plusSeconds(5)))
                    || claims.getSubject() == null || claims.getSubject().isBlank()
                    || (nonce != null && !nonce.equals(claims.getStringClaim("nonce")))) throw failure("CHATGPT_IDENTITY_INVALID");
            return new ChatGptCredentials(client, claims.getSubject(), claims.getStringClaim("email"), raw, "", "", now, Set.of());
        } catch (AuthFailure failure) { throw failure; }
        catch (Exception failure) { throw failure("CHATGPT_IDENTITY_INVALID"); }
    }

    protected String get(String url) {
        return request(HttpRequest.newBuilder(URI.create(url)).GET().timeout(Duration.ofSeconds(12)).build());
    }
    protected JsonNode token(Map<String, String> fields) {
        try {
            return json.readTree(request(HttpRequest.newBuilder(URI.create(ISSUER + "/api/accounts/oauth/token"))
                    .timeout(Duration.ofSeconds(12)).header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form(fields))).build()));
        } catch (AuthFailure failure) { throw failure; }
        catch (Exception failure) { throw failure("CHATGPT_TOKEN_EXCHANGE_FAILED"); }
    }
    private String request(HttpRequest request) {
        try {
            var response = http.send(request, ignored -> new ModelDiscovery.LimitedBody());
            if (response.statusCode() != 200) throw failure(response.statusCode() == 400 || response.statusCode() == 401
                    ? "CHATGPT_REAUTH_REQUIRED" : "CHATGPT_AUTH_UNAVAILABLE");
            return new String(response.body(), StandardCharsets.UTF_8);
        } catch (AuthFailure failure) { throw failure; }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw failure("CHATGPT_AUTH_INTERRUPTED"); }
        catch (Exception failure) { throw failure("CHATGPT_AUTH_UNAVAILABLE"); }
    }
    static AuthFailure failure(String code) { return new AuthFailure(code); }
    static final class AuthFailure extends RuntimeException {
        @Serial
        private static final long serialVersionUID = -9171366343445777283L;

        AuthFailure(String code) { super(code); } }
}
