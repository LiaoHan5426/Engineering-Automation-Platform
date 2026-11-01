package com.lh.eap.ai;

import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Explicit offline-test adapter. Never registered as a production bean or fallback. */
final class InMemoryCodeGenerationStore implements CodeGenerationStore {
    final ConcurrentHashMap<UUID, Snapshot> rows = new ConcurrentHashMap<>();
    public void save(Snapshot snapshot) {
        if (rows.putIfAbsent(snapshot.id(), snapshot) != null) throw new IllegalStateException("Duplicate generation");
    }
    public Optional<Snapshot> find(UUID id) { return Optional.ofNullable(rows.get(id)); }
}
