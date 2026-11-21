package com.lh.eap.core;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Read-only view of the registered MCP servers that the capability catalog needs to describe them.
 *
 * <p>This is a domain port: the orchestration layer renders the capability catalog without compiling
 * against the MCP implementation module (its JDBC registry, management service or static allow-list).
 * The MCP module supplies the adapter; every value returned here is an already-shaped, read-only view.
 *
 * <p>Fail closed by default: a composition with no MCP module uses {@link #empty()}, which reports no
 * servers, no grants and no expert-scoped vocabulary. The id naming rule is pure and stays available
 * even in that composition so callers never branch on module availability.
 */
public interface McpCatalogQuery {
    /** Capability id -&gt; expert ids granted to call it. */
    Map<String, List<String>> grantsByCapability();

    /** Expert-scoped capability ids published by usable servers ({@code mcp.<server>.<tool>}). */
    Collection<String> capabilityIds();

    /** One view per registered server, including tools, trusted/enabled flags and derived problems. */
    List<Map<String, Object>> serverViews();

    /** Locked official read-oriented production allow-list, as views. */
    List<Map<String, Object>> productionMatrix();

    /** The single naming rule for an MCP capability id. */
    static String capabilityId(String serverId, String tool) {
        return "mcp." + serverId + "." + tool;
    }

    /** Empty catalog for compositions that do not include the MCP module. */
    static McpCatalogQuery empty() {
        return new McpCatalogQuery() {
            @Override public Map<String, List<String>> grantsByCapability() { return Map.of(); }
            @Override public Collection<String> capabilityIds() { return List.of(); }
            @Override public List<Map<String, Object>> serverViews() { return List.of(); }
            @Override public List<Map<String, Object>> productionMatrix() { return List.of(); }
        };
    }
}
