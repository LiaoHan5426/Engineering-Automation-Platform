package com.lh.eap.ai;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * Stores working-memory snapshots under {@code <workspace>/.eap/working-memory/<id>.json}.
 * Files contain goals/refs only — never model transcripts or document bodies.
 */
@Component
public class FileWorkingMemoryStore implements WorkingMemoryStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Path directory;

    public FileWorkingMemoryStore(com.lh.eap.config.RuntimeWorkspace runtime) {
        this(runtime.workspace().resolve(".eap").resolve("working-memory"));
    }

    public FileWorkingMemoryStore(Path directory) {
        this.directory = Objects.requireNonNull(directory, "directory").toAbsolutePath().normalize();
    }

    public Path directory() {
        return directory;
    }

    @Override
    public synchronized void save(UUID conversationId, TaskWorkingMemory.Snapshot snapshot) {
        Objects.requireNonNull(conversationId, "conversationId");
        Objects.requireNonNull(snapshot, "snapshot");
        try {
            Files.createDirectories(directory);
            var file = file(conversationId);
            var payload = new LinkedHashMap<String, Object>();
            payload.put("goal", snapshot.goal());
            payload.put("constraints", snapshot.constraints());
            payload.put("facts", snapshot.facts().stream()
                    .map(fact -> Map.of(
                            "kind", fact.kind(),
                            "id", fact.id(),
                            "revisionOrDigest", fact.revisionOrDigest()))
                    .toList());
            payload.put("evidenceRefs", snapshot.evidenceRefs());
            payload.put("dependencyKeys", List.copyOf(snapshot.dependencyKeys()));
            payload.put("invalidation", snapshot.invalidation());
            payload.put("updatedAt", snapshot.updatedAt() == null ? Instant.EPOCH.toString() : snapshot.updatedAt().toString());
            payload.put("layers", snapshot.layers());
            Files.writeString(file, JSON.writeValueAsString(payload), StandardCharsets.UTF_8);
        } catch (IOException | RuntimeException failure) {
            throw new IllegalStateException("WORKING_MEMORY_SAVE_FAILED", failure);
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public synchronized Optional<TaskWorkingMemory.Snapshot> load(UUID conversationId) {
        Objects.requireNonNull(conversationId, "conversationId");
        var file = file(conversationId);
        if (!Files.isRegularFile(file)) return Optional.empty();
        try {
            var raw = JSON.readValue(Files.readString(file, StandardCharsets.UTF_8), Map.class);
            String goal = text(raw.get("goal"));
            var constraints = strings(raw.get("constraints"));
            var evidence = strings(raw.get("evidenceRefs"));
            var dependencies = new LinkedHashSet<>(strings(raw.get("dependencyKeys")));
            var facts = new ArrayList<TaskWorkingMemory.FactRef>();
            if (raw.get("facts") instanceof List<?> entries) {
                for (var entry : entries) {
                    if (!(entry instanceof Map<?, ?> row)) continue;
                    facts.add(new TaskWorkingMemory.FactRef(
                            text(row.get("kind")), text(row.get("id")), text(row.get("revisionOrDigest"))));
                }
            }
            Instant updated = Instant.EPOCH;
            try {
                if (raw.get("updatedAt") instanceof String value && !value.isBlank()) updated = Instant.parse(value);
            } catch (RuntimeException ignored) {
                updated = Instant.EPOCH;
            }
            var state = TaskWorkingMemory.State.empty();
            if (!text(raw.get("invalidation")).isBlank()) {
                state.invalidate(text(raw.get("invalidation")), updated);
            } else {
                state.replace(goal, constraints, facts, evidence, dependencies, updated);
            }
            return Optional.of(state.snapshot());
        } catch (IOException | RuntimeException failure) {
            return Optional.empty();
        }
    }

    @Override
    public synchronized void delete(UUID conversationId) {
        Objects.requireNonNull(conversationId, "conversationId");
        try {
            Files.deleteIfExists(file(conversationId));
        } catch (IOException failure) {
            throw new IllegalStateException("WORKING_MEMORY_DELETE_FAILED", failure);
        }
    }

    private Path file(UUID conversationId) {
        return directory.resolve(conversationId + ".json");
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static List<String> strings(Object raw) {
        if (!(raw instanceof List<?> entries)) return List.of();
        var values = new ArrayList<String>();
        for (var entry : entries) {
            if (entry instanceof String text) values.add(text);
        }
        return values;
    }
}
