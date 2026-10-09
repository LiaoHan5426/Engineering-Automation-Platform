package com.lh.eap.web;

import com.lh.eap.core.LocalBinaries;
import java.util.*;
import java.util.regex.Pattern;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Managing MCP servers: where they are, which of their tools are allowed, and whether they are trusted.
 *
 * <p>{@link McpServerRegistry} answers the runtime's question — may this tool be called, and by whom?
 * This class answers the operator's opposite question: how do I make a tool callable at all? Registration
 * is a deliberate platform action with its own entry point, because a capability that only ever appears
 * when a manifest names it is unmanageable by construction.
 *
 * <p>Three properties are enforced here rather than left to the operator's discipline:
 *
 * <ul>
 *   <li><b>Identifiers must survive becoming capability ids.</b> Both the server id and every tool name
 *       end up inside {@code mcp.<server>.<tool>}, which is validated as an expert-scoped capability id
 *       by {@link ExpertGraph}. Enforcing the same charset at registration means a name that would be
 *       rejected later is rejected now, with a message that says why.</li>
 *   <li><b>No credentials.</b> The endpoint is a location, not a secret store; a token in it is refused
 *       rather than quietly persisted. Secrets are injected by the environment, like every other profile
 *       in this platform.</li>
 *   <li><b>Nothing is executed.</b> Probing checks that the transport <em>target</em> exists. No MCP
 *       protocol client is implemented yet, so the tool list stays an operator declaration and is
 *       reported as unverified rather than presented as a discovery result.</li>
 * </ul>
 */
@Service
public class McpServerService {
    /** Same shape {@link ExpertGraph} requires of a capability id segment, enforced at the source. */
    static final Pattern SEGMENT = Pattern.compile("[a-z0-9][a-z0-9_-]{0,60}");
    static final Set<String> TRANSPORTS = Set.of("stdio", "http", "sse");

    private final JdbcTemplate jdbc;
    private final McpServerRegistry registry;
    private final CapabilityUsage usage;

    public McpServerService(JdbcTemplate jdbc, McpServerRegistry registry, CapabilityUsage usage) {
        this.jdbc = jdbc;
        this.registry = registry;
        this.usage = usage;
    }

    /**
     * Every registered server with everything needed to manage it.
     *
     * <p>{@code problems} is computed, not stored: a server that is registered but unusable always says
     * why, so the page cannot show a green row for a server whose tools could never be called.
     */
    public List<Map<String, Object>> list() {
        var grants = registry.grantsByCapability();
        var usageMap = usage.usage();
        var result = new ArrayList<Map<String, Object>>();
        for (var row : rows()) {
            var entry = new LinkedHashMap<String, Object>();
            var id = row.id();
            entry.put("id", id);
            entry.put("name", row.name());
            entry.put("transport", row.transport());
            entry.put("endpoint", row.endpoint());
            entry.put("trusted", row.trusted());
            entry.put("enabled", row.enabled());
            entry.put("usable", row.trusted() && row.enabled());
            entry.put("tools", row.tools());
            var capabilities = row.tools().stream().map(tool -> McpServerRegistry.capabilityId(id, tool)).toList();
            entry.put("capabilities", capabilities);
            var authorised = new LinkedHashSet<String>();
            var enabledExperts = new LinkedHashSet<String>();
            for (var capability : capabilities) {
                authorised.addAll(grants.getOrDefault(capability, List.of()));
                enabledExperts.addAll(usageMap.enabledFor(capability));
            }
            entry.put("authorisedExperts", List.copyOf(authorised));
            entry.put("enabledExperts", List.copyOf(enabledExperts));
            entry.put("problems", problems(row));
            result.add(entry);
        }
        return result;
    }

    /**
     * Register or update a server.
     *
     * <p>Updating is as consequential as registering: removing a tool, or withdrawing trust, breaks any
     * enabled expert that was granted that tool. Those edits are refused with the expert list, so the
     * breakage is decided by the operator instead of discovered by a failing run.
     */
    public void save(String id, String name, String transport, String endpoint, List<String> tools,
                     boolean trusted, boolean enabled) {
        var serverId = required(id, "服务器标识");
        if (!SEGMENT.matcher(serverId).matches()) {
            throw new IllegalArgumentException("服务器标识只允许小写字母、数字、下划线和连字符，且不超过61字符："
                    + "它会成为能力标识 mcp.<服务器>.<工具> 的一段");
        }
        var label = name == null || name.isBlank() ? serverId : name.trim();
        if (label.length() > 200) throw new IllegalArgumentException("服务器名称最多200字符");
        var channel = transport == null || transport.isBlank() ? "stdio" : transport.trim().toLowerCase(Locale.ROOT);
        if (!TRANSPORTS.contains(channel)) throw new IllegalArgumentException("传输方式只能是 stdio、http 或 sse");
        var location = endpoint == null ? "" : endpoint.trim();
        if ("stdio".equals(channel)) {
            if (location.isEmpty()) throw new IllegalArgumentException("stdio 服务器必须填写启动命令");
            if (location.length() > 300) throw new IllegalArgumentException("启动命令最多300字符");
        } else {
            if (!location.startsWith("http://") && !location.startsWith("https://")) {
                throw new IllegalArgumentException("http/sse 服务器必须填写 http:// 或 https:// 开头的地址");
            }
            if (location.length() > 300) throw new IllegalArgumentException("地址最多300字符");
        }
        if (location.chars().anyMatch(Character::isISOControl)) throw new IllegalArgumentException("地址不能包含控制字符");
        if (SensitiveData.containsSecret(location)) {
            throw new IllegalArgumentException("地址不能包含凭据：平台不保存 Token 或密钥，请通过环境变量注入");
        }
        var allowList = new ArrayList<String>();
        for (var raw : tools == null ? List.<String>of() : tools) {
            var tool = required(raw, "工具名");
            if (!SEGMENT.matcher(tool).matches()) {
                throw new IllegalArgumentException("工具名 " + tool + " 不合法：它会被拼进能力标识 mcp." + serverId
                        + ".<工具>，只允许小写字母、数字、下划线和连字符，且不超过61字符");
            }
            if (!allowList.contains(tool)) allowList.add(tool);
        }
        if (allowList.size() > 50) throw new IllegalArgumentException("工具白名单最多50项");

        var existing = rows().stream().filter(server -> server.id().equals(serverId)).findFirst().orElse(null);
        if (existing != null) {
            var withdrawn = new TreeSet<>(existing.tools());
            withdrawn.removeAll(allowList);
            var becomesUnusable = existing.trusted() && existing.enabled() && (!trusted || !enabled);
            if (becomesUnusable) withdrawn.addAll(existing.tools());
            for (var tool : withdrawn) {
                var capability = McpServerRegistry.capabilityId(serverId, tool);
                var experts = usage.enabledExpertsUsing(capability);
                if (!experts.isEmpty()) {
                    throw new IllegalStateException("工具 " + capability + " 仍被已启用专家授权：" + String.join("、", experts)
                            + "。撤回信任或移除工具会让这些专家的调用失败；请先停用这些专家，或在专家清单与授权中移除该工具。");
                }
            }
        }
        var json = tools(allowList);
        jdbc.update("INSERT INTO eap.mcp_server (id,name,transport,endpoint,trusted,enabled,tools,updated_at) "
                        + "VALUES (?,?,?,?,?,?,?::jsonb,now()) "
                        + "ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, transport=EXCLUDED.transport, "
                        + "endpoint=EXCLUDED.endpoint, trusted=EXCLUDED.trusted, enabled=EXCLUDED.enabled, "
                        + "tools=EXCLUDED.tools, updated_at=now()",
                serverId, label, channel, location, trusted, enabled, json);
    }

    /**
     * Remove a server.
     *
     * <p>Refused while an enabled expert holds a grant for one of its tools, for the same reason a rule
     * pack cannot be deleted while an enabled expert references it: the tool would stop resolving and the
     * expert would fail at run time with no obvious cause.
     */
    public void delete(String id) {
        var serverId = required(id, "服务器标识");
        var grants = registry.grantsByCapability();
        var blocked = new TreeSet<String>();
        for (var row : rows()) {
            if (!row.id().equals(serverId)) continue;
            for (var tool : row.tools()) {
                var capability = McpServerRegistry.capabilityId(serverId, tool);
                if (!usage.enabledExpertsUsing(capability).isEmpty()) blocked.add(capability);
            }
        }
        if (!blocked.isEmpty()) {
            throw new IllegalStateException("服务器 " + serverId + " 仍被已启用专家授权使用：" + String.join("、", blocked)
                    + "。请先停用这些专家，再删除该服务器。");
        }
        jdbc.update("DELETE FROM eap.mcp_server WHERE id=?", serverId);
        // Grants for tools that no longer exist are pointless rows; removing them keeps the grant table
        // meaningful as an answer to "who may call what".
        for (var capability : grants.keySet()) {
            if (capability.startsWith("mcp." + serverId + ".")) {
                jdbc.update("DELETE FROM eap.expert_mcp_grant WHERE capability=?", capability);
            }
        }
    }

    /**
     * Check the transport target. Explicitly <em>not</em> a connection test.
     *
     * <p>The MCP protocol client does not exist yet, so this can only answer "is the thing we would
     * launch reachable", and it says so in the result. The tool list remains an operator declaration:
     * showing it as a verified discovery would be a lie that survives into a capability id.
     */
    public Map<String, Object> probe(String id) {
        var serverId = required(id, "服务器标识");
        var server = rows().stream().filter(row -> row.id().equals(serverId)).findFirst().orElse(null);
        var result = new LinkedHashMap<String, Object>();
        result.put("id", serverId);
        if (server == null) {
            result.put("checked", false);
            result.put("message", "未找到该服务器。");
            return result;
        }
        result.put("transport", server.transport());
        result.put("target", server.endpoint());
        result.put("verified", false);
        if ("stdio".equals(server.transport())) {
            var command = server.endpoint().isBlank() ? "" : server.endpoint().trim().split("\\s+")[0];
            var resolved = LocalBinaries.resolve(command);
            result.put("checked", true);
            result.put("targetResolved", resolved.map(Object::toString).orElse(null));
            result.put("reachable", resolved.isPresent());
            result.put("message", resolved.isPresent()
                    ? "启动命令存在：" + resolved.get() + "。平台未连接该服务器，工具白名单仍为操作者声明，未经协议验证。"
                    : "启动命令 " + command + " 未在 PATH 中找到：该服务器即使被信任也不会可用。"
                            + "平台未执行该命令，只做了文件查找；工具白名单仍为操作者声明，未经协议验证。");
            return result;
        }
        result.put("checked", true);
        result.put("targetResolved", server.endpoint());
        result.put("reachable", true);
        result.put("message", "远端地址格式有效，平台未发起连接（MCP 客户端尚未实现），工具白名单仍为操作者声明，未经协议验证。");
        return result;
    }

    /** Servers that are registered but not callable, each with the reason. */
    private List<String> problems(Stored row) {
        var problems = new ArrayList<String>();
        if (row.tools().isEmpty()) problems.add("工具白名单为空：该服务器不会发布任何能力");
        if (!row.enabled()) problems.add("未启用：平台不会把它的工具交给任何专家");
        if (!row.trusted()) problems.add("未信任：未信任的服务器不会被调用");
        return List.copyOf(problems);
    }

    /**
     * The raw rows, including {@code endpoint}, which {@link McpServerRegistry} does not need and
     * deliberately does not expose to the runtime.
     */
    private List<Stored> rows() {
        List<Map<String, Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT id,name,transport,endpoint,trusted,enabled,"
                    + "COALESCE((SELECT string_agg(value->>'name', ',' ORDER BY value->>'name') "
                    + "FROM jsonb_array_elements(tools)), '') AS tool_names "
                    + "FROM eap.mcp_server ORDER BY id");
        } catch (RuntimeException error) {
            return List.of();
        }
        if (rows == null) return List.of();
        var result = new ArrayList<Stored>();
        for (var row : rows) {
            var id = text(row.get("id"));
            if (id == null) continue;
            var tools = new ArrayList<String>();
            for (var tool : Objects.toString(row.get("tool_names"), "").split(",")) {
                var value = text(tool);
                if (value != null) tools.add(value);
            }
            result.add(new Stored(id, Objects.toString(row.get("name"), id),
                    Objects.toString(row.get("transport"), "stdio"), Objects.toString(row.get("endpoint"), ""),
                    Boolean.TRUE.equals(row.get("trusted")), Boolean.TRUE.equals(row.get("enabled")),
                    List.copyOf(tools)));
        }
        return List.copyOf(result);
    }

    private record Stored(String id, String name, String transport, String endpoint, boolean trusted,
                          boolean enabled, List<String> tools) { }

    /**
     * The stored tool shape. It is JSON because it is the same shape an MCP server advertises — {@code
     * tools/list} returns objects, not bare strings — so the allow-list can later be filled from a real
     * handshake without a migration.
     */
    private static String tools(List<String> names) {
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        var shaped = names.stream().map(name -> Map.of("name", name)).toList();
        try {
            return mapper.writeValueAsString(shaped);
        } catch (RuntimeException error) {
            throw new IllegalArgumentException("工具白名单无法序列化：" + error.getClass().getSimpleName());
        }
    }

    private static String required(String value, String label) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(label + "不能为空");
        return value.trim();
    }

    private static String text(Object value) {
        if (value == null) return null;
        var text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }
}
