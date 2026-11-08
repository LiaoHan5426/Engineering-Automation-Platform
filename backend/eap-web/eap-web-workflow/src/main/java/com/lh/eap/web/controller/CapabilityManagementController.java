package com.lh.eap.web.controller;

import com.lh.eap.application.dto.CapabilityActivationRequest;
import com.lh.eap.application.dto.CliChannelRequest;

import com.lh.eap.application.service.CapabilitySettings;
import com.lh.eap.application.service.CliChannels;

import com.lh.eap.domain.model.CapabilityKind;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;

import java.nio.file.Path;
import java.util.*;
import org.springframework.http.HttpStatus;
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
    private final Path workspace;
    private final com.lh.eap.application.service.CliProgramService programs;

    public CapabilityManagementController(CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                                          CliChannels channels, Path workspace, com.lh.eap.application.service.CliProgramService programs) {
        this.handlers = handlers;
        this.settings = settings;
        this.channels = channels;
        this.workspace = workspace;
        this.programs = programs;
    }

    /**
     * Enable or disable one capability, and record why.
     *
     * <p>The notes field is not decoration: a switch that nobody explained becomes folklore, so the
     * reason travels with the state and is shown next to it in the catalog.
     */
    @PutMapping("/capabilities/{name}/activation")
    public Map<String, Object> activate(@PathVariable String name, @RequestBody CapabilityActivationRequest request) {
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
    public Map<String, Object> channel(@PathVariable String name, @RequestBody CliChannelRequest request) {
        var handler = requireRegistered(name);
        if (handler.kind() != CapabilityKind.CLI) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, name
                    + " 不是本地 CLI 能力，没有二进制通道。内置命令不依赖外部可执行文件，"
                    + "其执行内容属于代码，只能启用或停用。");
        }
        try {
            channels.configure(programs.programIdForCapability(name), request == null ? null : request.binary());
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
        return channels.probe(programs.programIdForCapability(name), shippedBinary(handler, name), workspace);
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
        var channel = channels.channel(programs.programIdForCapability(name), shippedBinary(handler, name));
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

}
