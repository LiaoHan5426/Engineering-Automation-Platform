package com.lh.eap.runtime.mcp.client;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Locked official read-oriented MCP package matrix for MCP-01 production grants.
 * Entries grow deliberately; each pins package@version and an allow-listed tool set.
 */
public final class OfficialReadonlyMcpMatrix {
    public record Entry(String packageName, String version, List<String> readonlyTools, String preferredTool) {
        public Entry {
            packageName = packageName == null ? "" : packageName.trim();
            version = version == null ? "" : version.trim();
            readonlyTools = readonlyTools == null ? List.of() : List.copyOf(readonlyTools);
            preferredTool = preferredTool == null || preferredTool.isBlank()
                    ? (readonlyTools.isEmpty() ? "" : readonlyTools.getFirst())
                    : preferredTool.trim();
        }

        public String packageAtVersion() {
            return packageName + "@" + version;
        }

        public String endpoint() {
            return "npx -y " + packageAtVersion();
        }

        public List<String> argv(String npxExecutable) {
            return List.of(npxExecutable, "-y", packageAtVersion());
        }

        public Map<String, Object> toView() {
            var view = new LinkedHashMap<String, Object>();
            view.put("packageName", packageName);
            view.put("version", version);
            view.put("packageAtVersion", packageAtVersion());
            view.put("endpoint", endpoint());
            view.put("readonlyTools", readonlyTools);
            view.put("preferredTool", preferredTool);
            return Map.copyOf(view);
        }
    }

    /**
     * Current matrix. Grow by appending pinned package@version entries with verified low-side-effect
     * tools; do not widen an entry until OfficialReadonlyMcpStdioTest proves the tool exists.
     */
    public static final List<Entry> ENTRIES = List.of(
            new Entry(
                    "@modelcontextprotocol/server-everything",
                    "2.2.1",
                    List.of("echo"),
                    "echo"));

    private OfficialReadonlyMcpMatrix() {}

    public static Entry primary() {
        return ENTRIES.getFirst();
    }

    public static Optional<Entry> findByEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank()) return Optional.empty();
        var trimmed = endpoint.trim();
        for (var entry : ENTRIES) {
            if (trimmed.equals(entry.endpoint()) || trimmed.contains(entry.packageAtVersion())) {
                return Optional.of(entry);
            }
        }
        return Optional.empty();
    }

    public static List<Map<String, Object>> views() {
        return ENTRIES.stream().map(Entry::toView).toList();
    }
}
