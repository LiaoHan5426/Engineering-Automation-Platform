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
    public record Entry(
            String packageName,
            String version,
            List<String> readonlyTools,
            String preferredTool,
            List<String> listOnlyTools) {
        public Entry {
            packageName = packageName == null ? "" : packageName.trim();
            version = version == null ? "" : version.trim();
            readonlyTools = readonlyTools == null ? List.of() : List.copyOf(readonlyTools);
            preferredTool = preferredTool == null || preferredTool.isBlank()
                    ? (readonlyTools.isEmpty() ? "" : readonlyTools.getFirst())
                    : preferredTool.trim();
            listOnlyTools = listOnlyTools == null ? List.of() : List.copyOf(listOnlyTools);
        }

        public Entry(String packageName, String version, List<String> readonlyTools, String preferredTool) {
            this(packageName, version, readonlyTools, preferredTool, List.of());
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

        /** Tools gate-proven via tools/call; excludes {@link #listOnlyTools()}. */
        public List<String> callVerifiedTools() {
            return readonlyTools.stream().filter(tool -> !listOnlyTools.contains(tool)).toList();
        }

        public Map<String, Object> toView() {
            var view = new LinkedHashMap<String, Object>();
            view.put("packageName", packageName);
            view.put("version", version);
            view.put("packageAtVersion", packageAtVersion());
            view.put("endpoint", endpoint());
            view.put("readonlyTools", readonlyTools);
            view.put("preferredTool", preferredTool);
            view.put("callVerifiedTools", callVerifiedTools());
            view.put("listOnlyTools", listOnlyTools);
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
                    "echo"),
            // Verified 2026-11-07 via stdio tools/list + tools/call (thought probe); low side-effect.
            new Entry(
                    "@modelcontextprotocol/server-sequential-thinking",
                    "0.6.2",
                    List.of("sequentialthinking"),
                    "sequentialthinking"),
            // Official knowledge-graph memory server; production grant limited to read_graph only.
            new Entry(
                    "@modelcontextprotocol/server-memory",
                    "2025.11.25",
                    List.of("read_graph"),
                    "read_graph"),
            // Filesystem server; production grant: list_directory + get_file_info + search_files +
            // list_allowed_directories (gate-called) + directory_tree (list-only; upstream schema bug).
            // Stdio gate appends an allow-listed directory argument (package requires ≥1 path).
            new Entry(
                    "@modelcontextprotocol/server-filesystem",
                    "2025.11.25",
                    List.of(
                            "list_directory",
                            "get_file_info",
                            "search_files",
                            "list_allowed_directories",
                            "directory_tree"),
                    "list_directory",
                    List.of("directory_tree")));

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
