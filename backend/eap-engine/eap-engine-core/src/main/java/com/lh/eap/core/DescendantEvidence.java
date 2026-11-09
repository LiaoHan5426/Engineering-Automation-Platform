package com.lh.eap.core;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

/** Bounded identity evidence, independent of the unbounded handles retained for cleanup. */
final class DescendantEvidence {
    private final List<Map<String, Object>> identities = new ArrayList<>();
    private boolean truncated;
    private int revision;
    private int published;
    private long nextPublication;

    void capture(ProcessHandle handle) {
        if (truncated) return;
        if (identities.size() == 32) { truncated = true; revision++; return; }
        var identity = new java.util.LinkedHashMap<String, Object>();
        identity.put("processPid", handle.pid());
        try {
            var info = handle.info();
            identity.put("processStartedAt", info.startInstant().map(Instant::toString).orElse(""));
            identity.put("processExecutable", info.command().orElse(""));
        } catch (RuntimeException unavailable) {
            // Keep the captured PID as an explicitly unverifiable clue; do not infer identity.
        }
        identities.add(Map.copyOf(identity));
        revision++;
    }

    Map<String, Object> snapshot() {
        return Map.of("processDescendants", List.copyOf(identities), "processDescendantsTruncated", truncated);
    }

    void publish(Consumer<Map<String, Object>> callback, boolean force) {
        long now = System.nanoTime();
        if (callback == null || revision == published || (!force && now < nextPublication)) return;
        callback.accept(snapshot());
        published = revision;
        nextPublication = now + java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(250);
    }
}
