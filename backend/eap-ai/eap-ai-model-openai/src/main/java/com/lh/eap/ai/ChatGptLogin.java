package com.lh.eap.ai;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import jakarta.annotation.PreDestroy;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/** A single local-operator OAuth ceremony. Only a public authorization URL and controlled status reach the UI. */
@Component
public final class ChatGptLogin {
    private final ModelConnections connections;
    private final ChatGptOAuthProtocol protocol;
    private final Map<UUID, Attempt> attempts = new ConcurrentHashMap<>();
    private final ScheduledExecutorService expiry = Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon().factory());
    private final ExecutorService callbacks = Executors.newVirtualThreadPerTaskExecutor();
    public ChatGptLogin(ModelConnections connections, ChatGptOAuthProtocol protocol) { this.connections = connections; this.protocol = protocol; }
    public record Started(UUID loginId, String authorizationUrl, Instant expiresAt) {}
    public record State(UUID loginId, String state, UUID connectionId, String error) {}

    public synchronized Started start(UUID existingConnection) {
        attempts.entrySet().removeIf(entry -> entry.getValue().expiresAt.plusSeconds(60).isBefore(Instant.now()));
        if (attempts.values().stream().anyMatch(item -> item.state.equals("waiting") || item.state.equals("exchanging")))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CHATGPT_LOGIN_ALREADY_PENDING");
        if (attempts.size() >= 16) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "CHATGPT_LOGIN_LIMIT");
        try {
            var previous = existingConnection == null ? null : connections.oauthCredentials(existingConnection);
            var host = connections.oauthHostId();
            var attempt = new Attempt(existingConnection == null ? UUID.randomUUID() : existingConnection, previous);
            attempt.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 1);
            attempt.callback = "http://127.0.0.1:" + attempt.server.getAddress().getPort() + "/auth/callback";
            attempt.server.createContext("/auth/callback", exchange -> callback(attempt, exchange));
            attempt.server.setExecutor(callbacks);
            attempt.server.start(); attempts.put(attempt.id, attempt);
            expiry.schedule(() -> finish(attempt, "expired", "CHATGPT_LOGIN_EXPIRED"), 300, TimeUnit.SECONDS);
            return new Started(attempt.id, protocol.authorize(host, attempt.oauthState, attempt.nonce,
                    challenge(attempt.verifier), attempt.callback, previous), attempt.expiresAt);
        } catch (ResponseStatusException failure) { throw failure; }
        catch (Exception failure) { throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CHATGPT_CALLBACK_UNAVAILABLE"); }
    }
    public State state(UUID id) {
        var attempt = require(id); return new State(id, attempt.state, attempt.state.equals("connected") || attempt.state.equals("permission_required") ? attempt.connectionId : null, attempt.error);
    }
    public void cancel(UUID id) { finish(require(id), "cancelled", ""); }
    private Attempt require(UUID id) {
        var attempt = attempts.get(id); if (attempt == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_CHATGPT_LOGIN"); return attempt;
    }
    private void callback(Attempt attempt, HttpExchange exchange) throws java.io.IOException {
        boolean accepted = false;
        try {
            if (!"GET".equals(exchange.getRequestMethod()) || !exchange.getRequestURI().getPath().equals("/auth/callback")) throw new IllegalArgumentException();
            var query = exchange.getRequestURI().getRawQuery();
            if (query == null || query.length() > 16000) throw new IllegalArgumentException();
            var fields = new HashMap<String, String>();
            for (var part : query.split("&")) {
                var pair = part.split("=", 2);
                if (fields.putIfAbsent(URLDecoder.decode(pair[0], StandardCharsets.UTF_8), pair.length == 2 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "") != null) throw new IllegalArgumentException();
            }
            if (!MessageDigest.isEqual(attempt.oauthState.getBytes(StandardCharsets.UTF_8), fields.getOrDefault("state", "").getBytes(StandardCharsets.UTF_8))
                    || !attempt.state.equals("waiting") || attempt.expiresAt.isBefore(Instant.now()) || !attempt.consumed.compareAndSet(false, true)) throw new IllegalArgumentException();
            accepted = true; attempt.state = "exchanging";
            if (fields.containsKey("error")) throw ChatGptOAuthProtocol.failure("CHATGPT_LOGIN_DENIED");
            String client = fields.getOrDefault("client_id", attempt.previous == null ? "" : attempt.previous.clientId());
            if (!client.matches("oaiapp_[A-Za-z0-9_-]{1,160}") || (attempt.previous != null && !client.equals(attempt.previous.clientId())))
                throw ChatGptOAuthProtocol.failure("CHATGPT_REGISTRATION_INVALID");
            String code = fields.getOrDefault("code", ""); if (code.isBlank()) throw new IllegalArgumentException();
            // Retain the issued registration before code exchange so a failed grant can be retried correctly.
            connections.registerOAuth(attempt.connectionId, client);
            var credentials = protocol.exchange(code, client, attempt.verifier, attempt.callback, attempt.nonce, attempt.previous);
            synchronized (attempt) {
                if (!attempt.state.equals("exchanging")) throw ChatGptOAuthProtocol.failure("CHATGPT_LOGIN_CANCELLED");
                connections.completeOAuth(attempt.connectionId, credentials);
                attempt.state = credentials.planGranted() ? "connected" : "permission_required";
            }
            reply(exchange, 200, "ChatGPT authorization received. Return to Engineering Automation Platform.");
        } catch (Exception failure) {
            if (accepted) {
                synchronized (attempt) {
                    if (attempt.state.equals("exchanging")) {
                        attempt.error = failure instanceof ChatGptOAuthProtocol.AuthFailure ? failure.getMessage() : "CHATGPT_LOGIN_FAILED";
                        attempt.state = "failed";
                    }
                }
            }
            reply(exchange, 400, "Authorization could not be completed. Return to the application and try again.");
        } finally {
            exchange.close();
            if (accepted) expiry.schedule(() -> attempt.server.stop(0), 1, TimeUnit.SECONDS);
        }
    }
    private static void reply(HttpExchange exchange, int status, String text) throws java.io.IOException {
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.getResponseHeaders().set("Referrer-Policy", "no-referrer");
        var bytes = text.getBytes(StandardCharsets.UTF_8); exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }
    private void finish(Attempt attempt, String state, String error) {
        synchronized (attempt) {
            if (!attempt.state.equals("waiting") && !attempt.state.equals("exchanging")) return;
            attempt.state = state; attempt.error = error; attempt.consumed.set(true); attempt.server.stop(0);
        }
    }
    private static String random() { byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes); }
    static String challenge(String value) throws NoSuchAlgorithmException { return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.US_ASCII))); }
    @PreDestroy public void close() { attempts.values().forEach(attempt -> attempt.server.stop(0)); expiry.shutdownNow(); callbacks.shutdownNow(); }
    private static final class Attempt {
        final UUID id = UUID.randomUUID(), connectionId;
        final String oauthState = random(), nonce = random(), verifier = random();
        final Instant expiresAt = Instant.now().plusSeconds(300);
        final AtomicBoolean consumed = new AtomicBoolean();
        final ChatGptCredentials previous;
        volatile String state = "waiting", error = "";
        String callback; HttpServer server;
        Attempt(UUID connectionId, ChatGptCredentials previous) { this.connectionId = connectionId; this.previous = previous; }
    }
}
