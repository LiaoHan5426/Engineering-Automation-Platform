package com.lh.eap.web;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The platform-side MCP registry.
 *
 * <p>An MCP tool is never a platform capability. It belongs to a server that an operator registered,
 * that is disabled until explicitly enabled, and that is untrusted until explicitly trusted; and a
 * server only exposes the tools on its allow-list. This class is the only place that knows those rows,
 * and it fails closed: if the table is missing, or a row is incomplete, or the query throws, the result
 * is "no MCP tools" rather than "probably fine".
 *
 * <p>Two consequences follow, and both are deliberate:
 *
 * <ul>
 *   <li>A manifest cannot bring a server into existence by naming it. A tool the registry does not know
 *       is rejected at save/enable time, so a typo cannot silently become a capability.</li>
 *   <li>Registering a server does <em>not</em> hand it to experts. Experts still have to declare the
 *       tool, activation still has to grant it, and the call still runs in that expert's own session —
 *       see {@link McpSessionRegistry} and {@link CapabilityScope#EXPERT}.</li>
 * </ul>
 */
@Service
public class McpServerRegistry {
    private final JdbcTemplate jdbc;

    public McpServerRegistry(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** A registered server, as far as the platform is willing to trust it. */
    public record McpServer(String id, String name, String transport, boolean trusted, boolean enabled,
                            List<String> tools) {
        public McpServer {
            tools = tools == null ? List.of() : List.copyOf(tools);
        }

        /** A server is usable only when it is both enabled and trusted; either flag alone is not enough. */
        public boolean usable() { return enabled && trusted; }
    }

    /**
     * Servers the platform may hand out. Fails closed: an unreadable registry yields no servers, which
     * means every {@code mcpTools} declaration is refused rather than silently permitted.
     */
    public List<McpServer> servers() {
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT id,name,transport,trusted,enabled,tools::text AS tools FROM eap.mcp_server ORDER BY id");
        } catch (RuntimeException error) {
            return List.of();
        }
        var result = new ArrayList<McpServer>();
        if (rows == null) return List.of();
        for (var row : rows) {
            var id = text(row.get("id"));
            if (id == null) continue;
            result.add(new McpServer(id, Objects.toString(row.get("name"), id),
                    Objects.toString(row.get("transport"), "stdio"),
                    Boolean.TRUE.equals(row.get("trusted")), Boolean.TRUE.equals(row.get("enabled")),
                    tools(row.get("tools"))));
        }
        return List.copyOf(result);
    }

    /** Servers that are enabled and trusted, i.e. the only ones whose tools may be called at all. */
    public List<McpServer> usableServers() {
        return servers().stream().filter(McpServer::usable).toList();
    }

    /**
     * The expert-scoped capability vocabulary: {@code mcp.<server>.<tool>} for every tool on the
     * allow-list of a usable server. Empty is the honest answer for a fresh install.
     */
    public Set<String> capabilityIds() {
        var result = new TreeSet<String>();
        for (var server : usableServers()) {
            for (var tool : server.tools()) result.add(capabilityId(server.id(), tool));
        }
        return result;
    }

    /** Which server publishes this capability, if any. Used to build an isolated call scope. */
    public Optional<String> serverOf(String capability) {
        for (var server : usableServers()) {
            for (var tool : server.tools()) {
                if (capabilityId(server.id(), tool).equals(capability)) return Optional.of(server.id());
            }
        }
        return Optional.empty();
    }

    public boolean publishes(String capability) { return serverOf(capability).isPresent(); }

    /** The tool names of the server publishing this capability; the allow-list is the boundary. */
    public List<String> allowedTools(String serverId) {
        return servers().stream().filter(server -> server.id().equals(serverId)).findFirst()
                .map(McpServer::tools).orElseGet(List::of);
    }

    /** Capabilities granted to an expert. Read-only; writes happen on activation. */
    public List<String> grants(String expertId) {
        try {
            var rows = jdbc.queryForList("SELECT capability FROM eap.expert_mcp_grant WHERE expert_id=?", expertId);
            if (rows == null) return List.of();
            var result = new ArrayList<String>();
            for (var row : rows) {
                var capability = text(row.get("capability"));
                if (capability != null) result.add(capability);
            }
            return List.copyOf(result);
        } catch (RuntimeException error) {
            return List.of();
        }
    }

    /** Every grant, grouped by expert — what the catalog shows next to an expert-scoped capability. */
    public Map<String, List<String>> grantsByCapability() {
        var result = new LinkedHashMap<String, List<String>>();
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT expert_id,capability FROM eap.expert_mcp_grant ORDER BY expert_id,capability");
        } catch (RuntimeException error) {
            return result;
        }
        if (rows == null) return result;
        for (var row : rows) {
            var expert = text(row.get("expert_id"));
            var capability = text(row.get("capability"));
            if (expert == null || capability == null) continue;
            result.computeIfAbsent(capability, key -> new ArrayList<>());
            if (!result.get(capability).contains(expert)) result.get(capability).add(expert);
        }
        result.replaceAll((key, value) -> List.copyOf(value));
        return result;
    }

    public static String capabilityId(String serverId, String tool) {
        return "mcp." + serverId + "." + tool;
    }

    private static String text(Object value) {
        if (value == null) return null;
        var text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    /**
     * The tool allow-list is stored as JSON ({@code [{"name":"query","readOnly":true}]}) because it is
     * the same shape an MCP server advertises. Anything unparsable yields no tools, never all tools.
     */
    private static List<String> tools(Object raw) {
        var text = text(raw);
        if (text == null) return List.of();
        try {
            var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
            var parsed = mapper.readValue(text, List.class);
            var result = new ArrayList<String>();
            for (var entry : parsed) {
                if (entry instanceof Map<?, ?> map) {
                    var name = text(map.get("name"));
                    if (name != null) result.add(name);
                } else {
                    var name = text(entry);
                    if (name != null) result.add(name);
                }
            }
            return List.copyOf(result);
        } catch (RuntimeException error) {
            return List.of();
        }
    }
}
