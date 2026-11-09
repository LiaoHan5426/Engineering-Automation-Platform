package com.lh.eap.application.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import tools.jackson.databind.json.JsonMapper;

/**
 * TD-01: durable version-probe snapshots under {@code .eap/cache/trusted-tool-probes.json}.
 * Failures to read/write leave the in-memory map intact and never invent versions.
 */
final class TrustedToolProbeStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private final Path file;

    TrustedToolProbeStore(Path file) {
        this.file = Objects.requireNonNull(file, "file").toAbsolutePath().normalize();
    }

    static TrustedToolProbeStore underWorkspace(Path workspace) {
        var root = workspace == null ? Path.of(".") : workspace;
        return new TrustedToolProbeStore(
                root.toAbsolutePath().normalize().resolve(".eap").resolve("cache").resolve("trusted-tool-probes.json"));
    }

    Path file() {
        return file;
    }

    @SuppressWarnings("unchecked")
    Map<String, TrustedToolCatalogService.VersionProbe> load() {
        var loaded = new ConcurrentHashMap<String, TrustedToolCatalogService.VersionProbe>();
        var conflicts = new java.util.HashSet<String>();
        if (!Files.isRegularFile(file)) return loaded;
        try {
            var raw = JSON.readValue(Files.readString(file, StandardCharsets.UTF_8), Map.class);
            var probes = raw.get("probes");
            if (!(probes instanceof Map<?, ?> rows)) return loaded;
            for (var entry : rows.entrySet()) {
                if (entry.getKey() == null || !(entry.getValue() instanceof Map<?, ?> row)) continue;
                var toolId = CliChannels.programId(String.valueOf(entry.getKey()).trim());
                if (toolId.isEmpty()) continue;
                if (conflicts.contains(toolId)) continue;
                var status = text(row.get("versionStatus"));
                if (!"known".equals(status) && !"probe_failed".equals(status)) continue;
                var version = "known".equals(status) ? text(row.get("detectedVersion")) : "";
                var snapshot = new TrustedToolCatalogService.VersionProbe(
                        status,
                        version,
                        text(row.get("probedAt")),
                        text(row.get("resolvedPath")),
                        text(row.get("probeNote")));
                var prior = loaded.get(toolId);
                if (prior != null && (!prior.resolvedPath().equals(snapshot.resolvedPath())
                        || !prior.detectedVersion().equals(snapshot.detectedVersion()))) {
                    loaded.remove(toolId);
                    conflicts.add(toolId);
                } else loaded.put(toolId, snapshot);
            }
        } catch (IOException | RuntimeException ignored) {
            // Corrupt cache must not block catalog; treat as empty.
        }
        return loaded;
    }

    void save(Map<String, TrustedToolCatalogService.VersionProbe> probes) {
        try {
            Files.createDirectories(file.getParent());
            var rows = new LinkedHashMap<String, Object>();
            for (var entry : probes.entrySet()) {
                var probe = entry.getValue();
                if (probe == null) continue;
                var row = new LinkedHashMap<String, Object>();
                row.put("versionStatus", probe.versionStatus());
                row.put("detectedVersion", probe.detectedVersion());
                row.put("probedAt", probe.probedAt());
                row.put("resolvedPath", probe.resolvedPath());
                row.put("probeNote", probe.probeNote());
                rows.put(entry.getKey(), row);
            }
            var payload = new LinkedHashMap<String, Object>();
            payload.put("schema", "trusted-tool-probes/v2");
            payload.put("probes", rows);
            Files.writeString(file, JSON.writeValueAsString(payload), StandardCharsets.UTF_8);
        } catch (IOException | RuntimeException ignored) {
            // Persistence is best-effort; in-memory catalog remains authoritative for this process.
        }
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }
}
