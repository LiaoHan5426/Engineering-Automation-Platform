package com.lh.eap.web;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The capability catalog.
 *
 * <p>The old catalog was a flat list of names, which answered none of the questions an operator
 * actually has: is this an in-process command or a local binary, may the platform turn it on for every
 * expert, what does it need to be given, what does it publish, is it runnable on this machine, and
 * which experts depend on it.
 *
 * <p>It now also answers the question that follows immediately afterwards — "and where do I change it?"
 * — because a list you cannot act on is only half a catalog. Each kind carries its
 * {@link CapabilityManagement} surface (what can be changed, and how instances come into existence), and
 * the console builds its sub-navigation from that: a kind with a management surface gets a page even
 * while it is empty, because that page is the entry point that makes it stop being empty. A kind with
 * nothing to manage and nothing to show gets no page rather than a dead tab.
 *
 * <p>Everything it reports comes from the handlers themselves plus read-only queries, so the catalog
 * cannot drift from what the runtime can really execute. It also reconciles the declared manifest
 * vocabulary against the registered handlers and reports any mismatch instead of hiding it.
 */
@Service
public class CapabilityCatalog {
    private final CapabilityHandlerRegistry handlers;
    private final JdbcTemplate jdbc;
    private final McpServerRegistry mcpServers;
    private final McpServerService mcp;
    private final CliChannels cliChannels;
    private final CapabilitySettings settings;
    private final CapabilityUsage usage;

    public CapabilityCatalog(CapabilityHandlerRegistry handlers, JdbcTemplate jdbc) {
        this(handlers, jdbc, new McpServerRegistry(jdbc), new CliChannels(jdbc),
                new CapabilityUsage(jdbc));
    }

    public CapabilityCatalog(CapabilityHandlerRegistry handlers, JdbcTemplate jdbc, McpServerRegistry mcpServers) {
        this(handlers, jdbc, mcpServers, new CliChannels(jdbc), new CapabilityUsage(jdbc));
    }

    CapabilityCatalog(CapabilityHandlerRegistry handlers, JdbcTemplate jdbc, McpServerRegistry mcpServers,
                      CliChannels cliChannels, CapabilityUsage usage) {
        this.handlers = handlers;
        this.jdbc = jdbc;
        this.mcpServers = mcpServers;
        this.cliChannels = cliChannels;
        this.usage = usage;
        this.settings = new CapabilitySettings(jdbc, usage);
        this.mcp = new McpServerService(jdbc, mcpServers, usage);
    }

    public Map<String, Object> catalog() {
        var usageSnapshot = usage.usage();
        var grants = mcpServers.grantsByCapability();
        var storedSettings = settings.all();
        var serverViews = mcp.list();
        var items = new ArrayList<Map<String, Object>>();
        var counts = new LinkedHashMap<String, Integer>();
        for (var handler : handlers.all()) {
            for (var descriptor : handler.describe()) {
                items.add(item(descriptor, handler.scope(), handler.availability(), storedSettings,
                        grants, usageSnapshot));
                counts.merge(descriptor.kind().id(), 1, Integer::sum);
            }
        }
        // A registered server publishes capabilities whether or not a handler exists for them. Listing
        // them keeps the MCP page meaningful the moment an operator registers a server, and the entry
        // says plainly that there is no implementation yet rather than appearing runnable.
        for (var server : serverViews) {
            var serverId = String.valueOf(server.get("id"));
            var tools = strings(server.get("tools"));
            for (var tool : tools) {
                var capability = McpServerRegistry.capabilityId(serverId, tool);
                if (items.stream().anyMatch(entry -> capability.equals(entry.get("name")))) continue;
                items.add(declaredMcpItem(capability, serverId, server, storedSettings, grants, usageSnapshot));
                counts.merge(CapabilityKind.MCP.id(), 1, Integer::sum);
            }
        }

        var kinds = new ArrayList<Map<String, Object>>();
        for (var kind : CapabilityKind.ORDER) {
            var management = kind.management();
            var count = counts.getOrDefault(kind.id(), 0);
            var entry = new LinkedHashMap<String, Object>();
            entry.put("id", kind.id());
            entry.put("label", kind.label());
            entry.put("description", kind.description());
            entry.put("scope", kind.defaultScope().id());
            entry.put("scopeLabel", kind.defaultScope().label());
            entry.put("expertScoped", kind.defaultScope() == CapabilityScope.EXPERT);
            entry.put("count", count);
            entry.put("management", management(management));
            entry.put("manageable", management.manageable());
            // A kind earns a page when there is something to manage or something to see.
            entry.put("visible", management.manageable() || count > 0);
            entry.put("availability", availabilityCounts(items, kind.id()));
            kinds.add(entry);
        }

        var registered = handlers.names();
        var unregistered = new TreeSet<>(ExpertGraph.CAPABILITIES);
        unregistered.removeAll(registered);
        var undeclared = new TreeSet<>(registered);
        undeclared.removeAll(ExpertGraph.CAPABILITIES);

        var result = new LinkedHashMap<String, Object>();
        var disabled = settings.disabled();
        result.put("items", items);
        result.put("kinds", kinds);
        result.put("capabilities", items.stream().map(item -> String.valueOf(item.get("name"))).toList());
        // The vocabulary an expert editor may offer as "just pick it": platform capabilities only, and
        // none of them switched off. An expert-scoped capability is never enabled by adding it to a
        // manifest — it needs a grant — so it is reported separately, and the editor must not present it
        // as a platform node. Disabled ones are listed separately too: a picker that silently omits them
        // would leave the operator wondering why an expert they wrote yesterday no longer validates.
        var platformUsable = new TreeSet<>(handlers.platformNames());
        platformUsable.removeAll(disabled);
        var platformDisabled = new TreeSet<>(handlers.platformNames());
        platformDisabled.retainAll(disabled);
        result.put("globallyUsable", new ArrayList<>(platformUsable));
        result.put("disabledPlatform", new ArrayList<>(platformDisabled));
        result.put("expertScoped", new ArrayList<>(handlers.expertScopedNames()));
        result.put("platformScoped", new ArrayList<>(handlers.platformNames()));
        result.put("expertScopedVocabulary", new ArrayList<>(mcpServers.capabilityIds()));
        result.put("mcpServers", serverViews);
        result.put("mcpTools", serverViews.stream().map(server -> {
            var entry = new LinkedHashMap<String, Object>();
            entry.put("id", server.get("id"));
            entry.put("name", server.get("name"));
            entry.put("usable", server.get("usable"));
            entry.put("tools", server.get("tools"));
            entry.put("capabilities", server.get("capabilities"));
            entry.put("trusted", server.get("trusted"));
            entry.put("enabled", server.get("enabled"));
            return entry;
        }).toList());
        result.put("settings", storedSettings);
        result.put("disabledCapabilities", new ArrayList<>(disabled));
        result.put("scopeNotes", Map.of(
                CapabilityScope.PLATFORM.id(), CapabilityScope.PLATFORM.description(),
                CapabilityScope.EXPERT.id(), CapabilityScope.EXPERT.description()));
        result.put("declared", ExpertGraph.CAPABILITIES.stream().sorted().toList());
        result.put("unregistered", List.copyOf(unregistered));
        result.put("undeclared", List.copyOf(undeclared));
        return result;
    }

    /** One registered capability, including what the operator can do about it. */
    private Map<String, Object> item(CapabilityDescriptor descriptor, CapabilityScope scope,
                                     CapabilityAvailability handlerAvailability,
                                     Map<String, CapabilitySettings.Setting> storedSettings,
                                     Map<String, List<String>> grants, CapabilityUsage.Usage snapshot) {
        var name = descriptor.name();
        var setting = storedSettings.getOrDefault(name, new CapabilitySettings.Setting(name, true, "", ""));
        var enabled = setting.enabled();
        var availability = enabled ? handlerAvailability : CapabilityAvailability.DISABLED;
        var entry = new LinkedHashMap<String, Object>();
        entry.put("name", name);
        entry.put("kind", descriptor.kind().id());
        entry.put("kindLabel", descriptor.kind().label());
        entry.put("management", management(descriptor.kind().management()));
        entry.put("scope", scope.id());
        entry.put("scopeLabel", scope.label());
        entry.put("expertScoped", scope == CapabilityScope.EXPERT);
        entry.put("registered", true);
        entry.put("title", descriptor.title());
        entry.put("summary", descriptor.summary());
        entry.put("inputs", descriptor.inputs());
        entry.put("grants", descriptor.grants());
        entry.put("executor", descriptor.executor());
        entry.put("binary", descriptor.binary());
        entry.put("facts", descriptor.facts());
        entry.put("evidence", descriptor.evidence());
        entry.put("readOnly", descriptor.readOnly());
        entry.put("enabled", enabled);
        entry.put("disabled", !enabled);
        entry.put("notes", setting.notes());
        entry.put("availability", availability.id());
        entry.put("availabilityLabel", availability.label());
        entry.put("globallyRunnable", scope == CapabilityScope.PLATFORM && availability.runnable());
        // The channel is what a CLI capability's management page edits: which binary is in effect, where
        // it resolved to, and whether that value is the shipped default or an operator override.
        if (descriptor.hasBinary()) {
            var channel = cliChannels.channel(name, descriptor.binary());
            var channelView = new LinkedHashMap<String, Object>();
            channelView.put("binary", channel.binary());
            channelView.put("source", channel.source());
            channelView.put("shipped", "shipped".equals(channel.source()));
            channelView.put("overridden", channel.overridden());
            channelView.put("resolvedPath", channel.resolvedPath());
            channelView.put("found", channel.resolvedPath() != null);
            channelView.put("availability", channel.availability().id());
            channelView.put("availabilityLabel", channel.availability().label());
            entry.put("cli", channelView);
        }
        entry.put("authorisedExperts", grants.getOrDefault(name, List.of()));
        entry.put("usedBy", snapshot.enabledFor(name));
        entry.put("declaredBy", snapshot.declaredFor(name));
        return entry;
    }

    /**
     * A capability an MCP server's allow-list publishes, with no handler behind it.
     *
     * <p>It gets a catalog entry — the MCP page would otherwise be empty for exactly the operator who
     * just registered a server — but the entry states that nothing implements it yet, because claiming
     * otherwise is the kind of lie that survives into an expert manifest.
     */
    private Map<String, Object> declaredMcpItem(String capability, String serverId, Map<String, Object> server,
                                                Map<String, CapabilitySettings.Setting> storedSettings,
                                                Map<String, List<String>> grants, CapabilityUsage.Usage snapshot) {
        var setting = storedSettings.getOrDefault(capability, new CapabilitySettings.Setting(capability, true, "", ""));
        var enabled = setting.enabled();
        var entry = new LinkedHashMap<String, Object>();
        entry.put("name", capability);
        entry.put("kind", CapabilityKind.MCP.id());
        entry.put("kindLabel", CapabilityKind.MCP.label());
        entry.put("management", management(CapabilityManagement.SERVER_REGISTRY));
        entry.put("scope", CapabilityScope.EXPERT.id());
        entry.put("scopeLabel", CapabilityScope.EXPERT.label());
        entry.put("expertScoped", true);
        entry.put("registered", false);
        entry.put("title", capability.substring(capability.lastIndexOf('.') + 1));
        entry.put("summary", "由 MCP 服务器 " + serverId + " 的工具白名单发布。平台尚未实现 MCP 客户端，"
                + "因此该能力没有处理器，节点无法执行；白名单是操作者声明，未经协议验证。");
        entry.put("inputs", List.of());
        entry.put("grants", List.of("服务器 " + serverId + " 的调用授权（由专家清单声明）"));
        entry.put("executor", "MCP · " + serverId + "（未接入）");
        entry.put("binary", null);
        entry.put("facts", List.of());
        entry.put("evidence", List.of("服务器返回内容（未验证）"));
        // Not a claim about the tool: the allow-list records a name, not an effect.
        entry.put("readOnly", false);
        entry.put("enabled", enabled);
        entry.put("disabled", !enabled);
        entry.put("notes", setting.notes());
        entry.put("availability", enabled ? CapabilityAvailability.NOT_CONFIGURED.id()
                : CapabilityAvailability.DISABLED.id());
        entry.put("availabilityLabel", enabled ? "尚未接入" : CapabilityAvailability.DISABLED.label());
        entry.put("globallyRunnable", false);
        entry.put("authorisedExperts", grants.getOrDefault(capability, List.of()));
        entry.put("usedBy", snapshot.enabledFor(capability));
        entry.put("declaredBy", snapshot.declaredFor(capability));
        entry.put("problems", strings(server.get("problems")));
        return entry;
    }

    private static Map<String, Object> management(CapabilityManagement management) {
        var entry = new LinkedHashMap<String, Object>();
        entry.put("id", management.id());
        entry.put("label", management.label());
        entry.put("description", management.description());
        entry.put("creation", management.creation());
        entry.put("manageable", management.manageable());
        return entry;
    }

    /** How many capabilities of a kind are runnable, waiting on a dependency, or switched off. */
    private static Map<String, Object> availabilityCounts(List<Map<String, Object>> items, String kindId) {
        var counts = new LinkedHashMap<String, Object>();
        for (var availability : CapabilityAvailability.values()) counts.put(availability.id(), 0);
        counts.put("total", 0);
        var total = 0;
        for (var item : items) {
            if (!kindId.equals(item.get("kind"))) continue;
            total++;
            var key = String.valueOf(item.get("availability"));
            counts.put(key, ((Number) counts.getOrDefault(key, 0)).intValue() + 1);
        }
        counts.put("total", total);
        return counts;
    }

    private static List<String> strings(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        var result = new ArrayList<String>();
        for (var item : list) if (item != null) result.add(String.valueOf(item));
        return List.copyOf(result);
    }
}
