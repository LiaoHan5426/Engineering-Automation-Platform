package com.lh.eap.application.service;
import com.lh.eap.persistence.mapper.CliProgramMapper;
import java.util.HashMap;
import com.lh.eap.error.CliProgramErrors;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.ToolErrors;

import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.domain.model.CapabilityAvailability;
import com.lh.eap.domain.model.CapabilityDescriptor;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * TD-01: aggregate built-in capability handler definitions with binding snapshot fields.
 * Catalog GET never runs binaries; version stays unknown until an explicit probe writeback.
 * Successful/failed probes persist under {@code .eap/cache/trusted-tool-probes.json}.
 */
@Service
public class TrustedToolCatalogService {
    private static final int DETECTED_VERSION_LIMIT = 120;

    private final CapabilityHandlerRegistry handlers;
    private final CapabilitySettings settings;
    private final CliChannels channels;
    private final RuntimeWorkspace runtime;
    private final TrustedToolProbeStore probeStore;
    private final ConcurrentHashMap<String, VersionProbe> probes;
    private CliProgramMapper programs;

    @Autowired
    public TrustedToolCatalogService(CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                                     CliChannels channels, RuntimeWorkspace runtime,
                                     CliProgramMapper programs) {
        this.handlers = handlers;
        this.settings = settings;
        this.channels = channels == null ? CliChannels.defaults() : channels;
        this.runtime = runtime;
        this.probeStore = TrustedToolProbeStore.underWorkspace(probeWorkspace());
        this.probes = new ConcurrentHashMap<>(this.probeStore.load());
        this.programs = programs;
    }

    /** Test helper when RuntimeWorkspace is irrelevant and persistence is disabled. */
    TrustedToolCatalogService(CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                              CliChannels channels) {
        this.handlers = handlers;
        this.settings = settings;
        this.channels = channels == null ? CliChannels.defaults() : channels;
        this.runtime = null;
        this.probeStore = null;
        this.probes = new ConcurrentHashMap<>();
    }

    /** Test helper that loads/saves probe snapshots from an explicit store file. */
    TrustedToolCatalogService(CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                              CliChannels channels, TrustedToolProbeStore probeStore) {
        this.handlers = handlers;
        this.settings = settings;
        this.channels = channels == null ? CliChannels.defaults() : channels;
        this.runtime = null;
        this.probeStore = probeStore;
        this.probes = new ConcurrentHashMap<>(probeStore == null ? Map.of() : probeStore.load());
    }

    public Map<String, Object> catalog() {
        var items = new ArrayList<Map<String, Object>>();
        var owners = new HashMap<String, String>();
        if (programs != null) programs.operations().forEach(op -> owners.put(op.capabilityId(), op.programId()));
        for (CapabilityHandler handler : handlers.all()) {
            for (CapabilityDescriptor descriptor : handler.describe()) {
                if (!descriptor.readOnly()) continue;
                items.add(item(descriptor, handler.scope().id(), settings.enabled(descriptor.name()),
                        owners.getOrDefault(descriptor.name(), CliChannels.programId(descriptor.name()))));
            }
        }
        long known = probes.values().stream().filter(probe -> "known".equals(probe.versionStatus())).count();
        long failed = probes.values().stream()
                .filter(probe -> "probe_failed".equals(probe.versionStatus()))
                .count();
        String newestProbedAt = probes.values().stream()
                .map(VersionProbe::probedAt)
                .filter(at -> at != null && !at.isBlank())
                .max(String::compareTo)
                .orElse("");
        var probeCache = new LinkedHashMap<String, Object>();
        probeCache.put("cached", probes.size());
        probeCache.put("known", known);
        probeCache.put("failed", failed);
        probeCache.put("newestProbedAt", newestProbedAt);
        var catalog = new LinkedHashMap<String, Object>();
        catalog.put("items", List.copyOf(items));
        catalog.put("programs", groupedPrograms(items));
        catalog.put("source", "capability-handlers");
        catalog.put("probeCache", Map.copyOf(probeCache));
        return Map.copyOf(catalog);
    }

    /**
     * Explicit operator action: run {@code <binary> --version} once and write the result back into the
     * catalog cache (memory + durable file when a store is configured). Does not authorize execution of
     * arbitrary capabilities.
     */
    public Map<String, Object> probeVersion(String toolId) {
        if (programs != null) {
            requireDescriptor(toolId);
            if (!settings.enabled(toolId)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, ToolErrors.CAPABILITY_DISABLED.code());
            var result = new LinkedHashMap<String, Object>(probeProgram(programId(toolId)));
            result.put("id", toolId);
            return result;
        }
        var descriptor = requireDescriptor(toolId);
        if (!descriptor.hasBinary()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ExecutionErrors.VERSION_PROBE_NOT_APPLICABLE.code());
        }
        var enabled = settings.enabled(toolId);
        var channel = channels.channel(toolId, descriptor.binary());
        var binding = classifyBinding(enabled, channel);
        if ("disabled".equals(binding)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, ToolErrors.CAPABILITY_DISABLED.code());
        }
        if ("conflict".equals(binding) || "missing_binary".equals(binding)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "BINDING_" + binding.toUpperCase());
        }

        var probe = channels.probe(toolId, descriptor.binary(), probeWorkspace());
        var executed = Boolean.TRUE.equals(probe.get("executed"));
        var success = Boolean.TRUE.equals(probe.get("success"));
        var output = text(probe.get("output"));
        var now = Instant.now().toString();
        var resolved = channel.resolvedPath() == null ? "" : channel.resolvedPath();

        VersionProbe snapshot;
        if (executed && success) {
            var version = firstLine(output);
            snapshot = new VersionProbe("known", version, now, resolved,
                    "显式探测成功；已持久化写回，目录 GET 不自动重探。");
        } else {
            var note = text(probe.get("message"));
            if (note.isEmpty()) note = "显式探测未成功；版本保持未知态写入 probe_failed。";
            snapshot = new VersionProbe("probe_failed", "", now, resolved, note);
        }
        probes.put(programId(toolId), snapshot);
        persistProbes();

        var payload = new LinkedHashMap<String, Object>();
        payload.put("id", toolId);
        payload.put("versionStatus", snapshot.versionStatus());
        payload.put("detectedVersion", snapshot.detectedVersion());
        payload.put("probedAt", snapshot.probedAt());
        payload.put("resolvedPath", snapshot.resolvedPath());
        payload.put("success", "known".equals(snapshot.versionStatus()));
        payload.put("message", snapshot.probeNote());
        payload.put("output", output);
        return Map.copyOf(payload);
    }

    private Map<String, Object> item(CapabilityDescriptor descriptor, String scope, boolean enabled, String programId) {
        var row = new LinkedHashMap<String, Object>();
        row.put("id", descriptor.name());
        row.put("title", descriptor.title());
        row.put("kind", descriptor.kind().id());
        row.put("scope", scope);
        row.put("readOnly", descriptor.readOnly());
        row.put("enabled", enabled);
        row.put("invocation", invocationFor(descriptor.name()));
        row.put("summary", descriptor.summary());
        if (descriptor.hasBinary()) {
            row.put("programId", programId);
            row.put("operationId", descriptor.name());
        }
        row.putAll(bindingFields(descriptor, enabled, programId));
        return row;
    }

    private Map<String, Object> bindingFields(CapabilityDescriptor descriptor, boolean enabled, String programId) {
        var fields = new LinkedHashMap<String, Object>();
        if (!descriptor.hasBinary()) {
            fields.put("bindingStatus", enabled ? "ready" : "disabled");
            fields.put("bindingSource", "builtin");
            fields.put("binary", "");
            fields.put("resolvedPath", "");
            fields.put("versionStatus", "not_applicable");
            fields.put("detectedVersion", "");
            fields.put("probedAt", "");
            fields.put("bindingNote", enabled ? "" : "已停用；定义保留在目录中，不停用不等于删除。");
            return fields;
        }
        var channel = channels.channel(descriptor.name(), descriptor.binary());
        fields.put("bindingSource", channel.source());
        fields.put("binary", channel.binary() == null ? "" : channel.binary());
        fields.put("resolvedPath", channel.resolvedPath() == null ? "" : channel.resolvedPath());
        var binding = classifyBinding(enabled, channel);
        fields.put("bindingStatus", binding);
        applyVersionFields(fields, programId, channel.resolvedPath() == null ? "" : channel.resolvedPath(), binding);
        if ("disabled".equals(binding)) {
            fields.put("bindingNote", "已停用快照：定义与绑定保留，调用入口拒绝执行。");
            return fields;
        }
        if ("conflict".equals(binding)) {
            fields.put("bindingNote", "操作员覆盖路径不可用，未静默回退到随附二进制。");
            return fields;
        }
        if ("missing_binary".equals(binding)) {
            fields.put("bindingNote", "未找到可执行文件：" + channel.binary());
            return fields;
        }
        if ("unknown".equals(fields.get("versionStatus"))) {
            fields.put("bindingNote", "二进制已解析；版本未知（目录不自动探测）。");
        } else if ("probe_failed".equals(fields.get("versionStatus"))) {
            fields.put("bindingNote", String.valueOf(fields.get("probeNote")));
        } else {
            fields.put("bindingNote", "二进制已解析；版本已由显式探测持久化写回。");
        }
        return fields;
    }

    private void applyVersionFields(Map<String, Object> fields, String toolId, String resolvedPath, String binding) {
        var cached = probes.get(toolId);
        if (cached != null && "ready".equals(binding) && resolvedPath.equals(cached.resolvedPath())) {
            fields.put("versionStatus", cached.versionStatus());
            fields.put("detectedVersion", cached.detectedVersion());
            fields.put("probedAt", cached.probedAt());
            fields.put("probeNote", cached.probeNote());
            return;
        }
        if (cached != null && !resolvedPath.equals(cached.resolvedPath())) {
            probes.remove(toolId);
            persistProbes();
        }
        fields.put("versionStatus", "unknown");
        fields.put("detectedVersion", "");
        fields.put("probedAt", "");
        fields.put("probeNote", "");
    }

    /**
     * Explicit operator action: drop durable probe snapshots so versions return to unknown until the
     * next probe. Does not change binding, enablement, or binary resolution.
     */
    public Map<String, Object> clearProbeCache() {
        var cleared = probes.size();
        probes.clear();
        persistProbes();
        return Map.of(
                "cleared", cleared,
                "remaining", probes.size(),
                "message", "已清除版本探测缓存；目录不再显示已知版本，直至下次显式探测。");
    }

    private void persistProbes() {
        if (probeStore != null) {
            probeStore.save(probes);
        }
    }

    private static String classifyBinding(boolean enabled, CliChannels.Channel channel) {
        if (!enabled) return "disabled";
        if (channel.availability() == CapabilityAvailability.MISSING_BINARY) {
            return channel.overridden() ? "conflict" : "missing_binary";
        }
        return "ready";
    }

    private CapabilityDescriptor requireDescriptor(String toolId) {
        if (toolId == null || toolId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "TOOL_ID_REQUIRED");
        }
        for (CapabilityHandler handler : handlers.all()) {
            for (CapabilityDescriptor descriptor : handler.describe()) {
                if (toolId.equals(descriptor.name()) && descriptor.readOnly()) {
                    return descriptor;
                }
            }
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, ToolErrors.TRUSTED_TOOL_NOT_FOUND.code());
    }

    private Path probeWorkspace() {
        if (runtime != null && runtime.root().allowed() && runtime.root().path() != null) {
            return runtime.root().path();
        }
        if (runtime != null && runtime.workspace() != null) {
            return runtime.workspace();
        }
        return Path.of(".").toAbsolutePath().normalize();
    }

    private static String invocationFor(String capability) {
        if ("git-status".equals(capability)) return "POST /api/cli-programs/git/operations/git-status/executions";
        if ("git-diff".equals(capability)) return "POST /api/cli-programs/git/operations/git-diff/executions";
        return "";
    }

    private String programId(String capability) {
        if (programs != null) return programs.operations().stream()
                .filter(op -> op.capabilityId().equals(capability)).map(op -> op.programId())
                .findFirst().orElseGet(() -> CliChannels.programId(capability));
        return CliChannels.programId(capability);
    }

    /** Program-owned projection; definitions and switches remain operation-owned. */
    private List<Map<String, Object>> groupedPrograms(List<Map<String, Object>> items) {
        var result = new ArrayList<Map<String, Object>>();
        if (programs == null) return result;
        for (var program : programs.programs()) {
            var operations = items.stream().filter(item -> program.id().equals(item.get("programId"))).toList();
            if (operations.isEmpty()) continue;
            var row = new LinkedHashMap<String, Object>();
            row.put("id", program.id()); row.put("title", program.name()); row.put("kind", "cli");
            row.put("operations", operations);
            row.putAll(programBinding(program.id(), program.binary()));
            result.add(Map.copyOf(row));
        }
        return List.copyOf(result);
    }

    private Map<String, Object> programBinding(String id, String binary) {
        var channel = channels.channel(id, binary);
        var fields = new LinkedHashMap<String, Object>();
        fields.put("binary", channel.binary()); fields.put("bindingSource", channel.source());
        fields.put("resolvedPath", channel.resolvedPath() == null ? "" : channel.resolvedPath());
        fields.put("bindingStatus", classifyBinding(true, channel));
        applyVersionFields(fields, id, String.valueOf(fields.get("resolvedPath")), String.valueOf(fields.get("bindingStatus")));
        return fields;
    }

    public Map<String, Object> probeProgram(String id) {
        var program = programs.program(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, CliProgramErrors.CLI_PROGRAM_NOT_FOUND.code()));
        var channel = channels.channel(id, program.binary());
        if (channel.resolvedPath() == null) throw new ResponseStatusException(HttpStatus.CONFLICT, ExecutionErrors.BINDING_UNAVAILABLE.code());
        var probe = channels.probe(id, program.binary(), probeWorkspace());
        boolean success = Boolean.TRUE.equals(probe.get("executed")) && Boolean.TRUE.equals(probe.get("success"));
        var snapshot = new VersionProbe(success ? "known" : "probe_failed", success ? firstLine(text(probe.get("output"))) : "",
                Instant.now().toString(), channel.resolvedPath(), text(probe.get("message")));
        probes.put(id, snapshot); persistProbes();
        var result = new LinkedHashMap<String, Object>(probe);
        result.put("id", id); result.put("versionStatus", snapshot.versionStatus());
        result.put("detectedVersion", snapshot.detectedVersion()); result.put("probedAt", snapshot.probedAt());
        return result;
    }

    private static String firstLine(String output) {
        if (output == null || output.isBlank()) return "";
        var line = output.lines().map(String::trim).filter(part -> !part.isEmpty()).findFirst().orElse("");
        if (line.length() <= DETECTED_VERSION_LIMIT) return line;
        return line.substring(0, DETECTED_VERSION_LIMIT) + "…";
    }

    private static String text(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    record VersionProbe(String versionStatus, String detectedVersion, String probedAt,
                        String resolvedPath, String probeNote) {}
}
