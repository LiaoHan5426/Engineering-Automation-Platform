package com.lh.eap.llm;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * SQL business cache and deterministic fallback compatibility boundary. Spring AI owns model calls.
 * The compression, cache and fallback rules here belong to the SQL bridge only. Chat memory and
 * external agents do not use this gateway.
 *
 * <p>Responsibilities:
 * <ul>
 *   <li>pick the first available provider (fail closed if none);</li>
 *   <li>serve identical requests from an in-memory LRU cache so repeated analyses cost nothing;</li>
 *   <li>account prompt/completion tokens and latency for audit;</li>
 *   <li>convert any failure into an empty result so the deterministic pipeline stays authoritative.</li>
 * </ul>
 */
@Service
public class LlmGateway {
    private static final Logger log = LoggerFactory.getLogger(LlmGateway.class);

    private final List<LlmProvider> providers;
    private final int cacheCapacity;
    private final Map<String, LlmProvider.Result> cache;

    public LlmGateway(List<LlmProvider> providers, @Value("${eap.llm.cache-entries:64}") int cacheCapacity) {
        this.providers = providers == null ? List.of() : providers;
        this.cacheCapacity = Math.max(1, cacheCapacity);
        this.cache = java.util.Collections.synchronizedMap(new LinkedHashMap<>(16, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<String, LlmProvider.Result> eldest) {
                return size() > LlmGateway.this.cacheCapacity;
            }
        });
    }

    public boolean available() {
        return providers.stream().anyMatch(LlmProvider::available);
    }

    public Optional<String> activeProviderId() {
        return providers.stream().filter(LlmProvider::available).map(LlmProvider::id).findFirst();
    }

    /** Returns a cached or fresh result, or empty when no provider is usable. */
    public Optional<LlmProvider.Result> complete(LlmProvider.Request request) {
        var result = completeWithEvidence(request);
        return result.ok() ? Optional.of(result) : Optional.empty();
    }

    /** Preserve failure codes for SQL evidence without removing the Optional compatibility API. */
    public LlmProvider.Result completeWithEvidence(LlmProvider.Request request) {
        var provider = providers.stream().map(LlmProvider::forRequest).filter(LlmProvider::available).findFirst().orElse(null);
        if (provider == null) return LlmProvider.Result.failure("spring-ai", "AI_NOT_CONFIGURED");
        var key = provider.cacheScope() + ":" + digest(request);
        var cached = cache.get(key);
        if (cached != null) {
            log.debug("Model cache hit for key {}", key.substring(0, Math.min(12, key.length())));
            return cached;
        }
        var result = provider.complete(request);
        if (!result.ok()) return result;
        cache.put(key, result);
        log.info("Model call ok: provider={}, promptTokens={}, completionTokens={}, latencyMs={}",
                result.providerId(), result.promptTokens(), result.completionTokens(), result.latencyMs());
        return result;
    }

    public static String digest(LlmProvider.Request request) {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            digest.update(request.systemPrompt().getBytes(StandardCharsets.UTF_8));
            digest.update((byte) 0);
            digest.update(request.userPrompt().getBytes(StandardCharsets.UTF_8));
            digest.update(Double.toString(request.temperature()).getBytes(StandardCharsets.UTF_8));
            digest.update(Integer.toString(request.maxTokens()).getBytes(StandardCharsets.UTF_8));
            if (request.cacheKey() != null) digest.update(request.cacheKey().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException unavailable) {
            return Integer.toHexString(request.userPrompt().hashCode());
        }
    }
}
