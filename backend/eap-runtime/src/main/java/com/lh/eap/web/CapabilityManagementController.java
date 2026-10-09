package com.lh.eap.web;

import java.nio.file.Path;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * The write side of the capability catalog.
 *
 * <p>The catalog answers "what is registered"; this answers "where do I change it". Both exist because a
 * read-only list of capabilities leaves the operator with no way to act on what it shows — and the
 * actions differ per kind, so the endpoints do too:
 *
 * <ul>
 *   <li>{@code /capabilities/{name}/activation} — the single on/off switch, for any kind. A capability
 *       that an enabled expert runs cannot be switched off; that is a {@code 409} naming the experts,
 *       matching how rule packs and knowledge bases behave.</li>
 *   <li>{@code /capabilities/{name}/cli} — where a local binary lives on this machine, plus an explicit
 *       probe. A CLI capability is code; only the location of its executable is configuration.</li>
 *   <li>{@code /mcp-servers} — register, trust, allow-list and remove MCP servers. The platform never
 *       creates a tool: it records where a server is and which of its tools are permitted.</li>
 * </ul>
 *
 * <p>There is deliberately no endpoint that creates a capability. An unknown name is a {@code 404} whose
 * message says so, because "adding a built-in command" means writing a handler — and the message points
 * at that contract instead of leaving the operator guessing.
 */
@RestController
@RequestMapping("/api")
public class CapabilityManagementController {
    private final CapabilityHandlerRegistry handlers;
    private final CapabilitySettings settings;
    private final CliChannels channels;
    private final McpServerService mcp;
    private final Path workspace;

    public CapabilityManagementController(CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                                          CliChannels channels, McpServerService mcp, Path workspace) {
        this.handlers = handlers;
        this.settings = settings;
        this.channels = channels;
        this.mcp = mcp;
        this.workspace = workspace;
    }

    /**
     * Enable or disable one capability, and record why.
     *
     * <p>The notes field is not decoration: a switch that nobody explained becomes folklore, so the
     * reason travels with the state and is shown next to it in the catalog.
     */
    @PutMapping("/capabilities/{name}/activation")
    @Transactional
    public Map<String, Object> activate(@PathVariable String name, @RequestBody Activation request) {
        requireRegistered(name);
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "缺少请求体");
        try {
            settings.save(name, request.enabled(), request.notes());
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
        var result = new LinkedHashMap<String, Object>();
        result.put("name", name);
        result.put("enabled", request.enabled());
        result.put("notes", request.notes() == null ? "" : request.notes().trim());
        return result;
    }

    /**
     * Point a local CLI capability at a specific binary, or clear the override so the shipped default
     * applies again. The value is resolved immediately so the response says whether it was found — a
     * saved path that does not exist would otherwise look like a working configuration.
     */
    @PutMapping("/capabilities/{name}/cli")
    @Transactional
    public Map<String, Object> channel(@PathVariable String name, @RequestBody ChannelRequest request) {
        var handler = requireRegistered(name);
        if (handler.kind() != CapabilityKind.CLI) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name
                    + " 不是本地 CLI 能力，没有二进制通道。内置命令不依赖外部可执行文件，"
                    + "其执行内容属于代码，只能启用或停用。");
        }
        try {
            channels.configure(name, request == null ? null : request.binary());
        } catch (IllegalArgumentException | IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
        var result = new LinkedHashMap<String, Object>();
        result.put("name", name);
        result.put("channel", channelView(name, handler));
        return result;
    }

    /**
     * Probe the configured binary by running {@code <binary> --version}.
     *
     * <p>Explicit, bounded by a short timeout, argument-array only, output redacted and truncated. A pure
     * {@code PATH} lookup cannot tell "installed" from "installed but broken"; this can, which is why it
     * exists as an operator action rather than something the catalog does while rendering.
     */
    @PostMapping("/capabilities/{name}/cli/probe")
    public Map<String, Object> probeChannel(@PathVariable String name) {
        var handler = requireRegistered(name);
        if (handler.kind() != CapabilityKind.CLI) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name + " 不是本地 CLI 能力，无法探测二进制");
        }
        return channels.probe(name, shippedBinary(handler, name), workspace);
    }

    @GetMapping("/mcp-servers")
    public Map<String, Object> mcpServers() {
        return Map.of("items", mcp.list());
    }

    /** Register a server, or update one that is already registered. */
    @PostMapping("/mcp-servers")
    @Transactional
    public Map<String, Object> registerServer(@RequestBody ServerRequest request) {
        return saveServer(request == null ? null : request.id(), request);
    }

    @PutMapping("/mcp-servers/{id}")
    @Transactional
    public Map<String, Object> updateServer(@PathVariable String id, @RequestBody ServerRequest request) {
        return saveServer(id, request);
    }

    /**
     * Flip enabled/trusted without rewriting the rest of the record. Each flag alone is not enough to
     * make a server usable — see {@code McpServerRegistry.McpServer.usable()} — so the response reports
     * the resulting state rather than the flag that was sent.
     */
    @PutMapping("/mcp-servers/{id}/activation")
    @Transactional
    public Map<String, Object> activateServer(@PathVariable String id, @RequestBody ServerActivation request) {
        var current = mcp.list().stream().filter(server -> id.equals(server.get("id"))).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "MCP 服务器不存在：" + id));
        var enabled = request == null || request.enabled() == null
                ? Boolean.TRUE.equals(current.get("enabled")) : request.enabled();
        var trusted = request == null || request.trusted() == null
                ? Boolean.TRUE.equals(current.get("trusted")) : request.trusted();
        var result = new LinkedHashMap<String, Object>();
        result.put("id", id);
        result.put("enabled", enabled);
        result.put("trusted", trusted);
        saveServer(id, new ServerRequest(id, String.valueOf(current.get("name")),
                String.valueOf(current.get("transport")), Objects.toString(current.get("endpoint"), ""),
                strings(current.get("tools")), trusted, enabled));
        return result;
    }

    /**
     * Remove a server. Refused while an enabled expert holds a grant for one of its tools, for the same
     * reason a rule pack cannot be deleted while an enabled expert references it.
     */
    @DeleteMapping("/mcp-servers/{id}")
    @Transactional
    public Map<String, Object> deleteServer(@PathVariable String id) {
        try {
            mcp.delete(id);
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
        return Map.of("id", id, "status", "deleted");
    }

    /** Transport-level check only: the MCP protocol client does not exist yet, and says so. */
    @PostMapping("/mcp-servers/{id}/probe")
    public Map<String, Object> probeServer(@PathVariable String id) {
        try {
            return mcp.probe(id);
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
    }

    private Map<String, Object> saveServer(String id, ServerRequest request) {
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "缺少请求体");
        try {
            mcp.save(id, request.name(), request.transport(), request.endpoint(), request.tools(),
                    Boolean.TRUE.equals(request.trusted()), Boolean.TRUE.equals(request.enabled()));
        } catch (IllegalStateException error) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, error.getMessage());
        } catch (IllegalArgumentException error) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, error.getMessage());
        }
        var result = new LinkedHashMap<String, Object>();
        result.put("id", id);
        result.put("saved", true);
        return result;
    }

    /**
     * A capability exists because code registered it, so an unknown name is not a validation error but a
     * statement about the contract: there is nothing to create here.
     */
    private CapabilityHandler requireRegistered(String name) {
        return handlers.find(name).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                "运行时没有注册能力 " + name + "。内置命令与本地 CLI 能力由代码注册（一个 CapabilityHandler Bean "
                        + "加一处声明），目录只能启用、停用或配置已有能力，不能通过接口新增。"));
    }

    private Map<String, Object> channelView(String name, CapabilityHandler handler) {
        var channel = channels.channel(name, shippedBinary(handler, name));
        var view = new LinkedHashMap<String, Object>();
        view.put("binary", channel.binary());
        view.put("source", channel.source());
        view.put("overridden", channel.overridden());
        view.put("resolvedPath", channel.resolvedPath());
        view.put("availability", channel.availability().id());
        view.put("availabilityLabel", channel.availability().label());
        return view;
    }

    /** The binary the handler ships with — the value an override replaces. */
    private static String shippedBinary(CapabilityHandler handler, String name) {
        for (var descriptor : handler.describe()) {
            if (name.equals(descriptor.name()) && descriptor.binary() != null) return descriptor.binary();
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, name + " 没有声明二进制，无法配置或探测通道");
    }

    private static List<String> strings(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        var result = new ArrayList<String>();
        for (var item : list) if (item != null) result.add(String.valueOf(item));
        return result;
    }

    /** {@code notes} explains the state; an unexplained switch becomes folklore. */
    public record Activation(boolean enabled, String notes) { }
    public record ChannelRequest(String binary) { }
    public record ServerRequest(String id, String name, String transport, String endpoint, List<String> tools,
                                Boolean trusted, Boolean enabled) { }
    public record ServerActivation(Boolean enabled, Boolean trusted) { }
}
