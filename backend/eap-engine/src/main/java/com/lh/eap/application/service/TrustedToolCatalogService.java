package com.lh.eap.application.service;

import com.lh.eap.domain.model.CapabilityAvailability;
import com.lh.eap.domain.model.CapabilityDescriptor;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * TD-01: aggregate built-in capability handler definitions with binding snapshot fields.
 * Does not execute binaries to render the catalog; version remains unknown until an explicit probe.
 */
@Service
public class TrustedToolCatalogService {
    private final CapabilityHandlerRegistry handlers;
    private final CapabilitySettings settings;
    private final CliChannels channels;

    public TrustedToolCatalogService(CapabilityHandlerRegistry handlers, CapabilitySettings settings,
                                     CliChannels channels) {
        this.handlers = handlers;
        this.settings = settings;
        this.channels = channels == null ? CliChannels.defaults() : channels;
    }

    public Map<String, Object> catalog() {
        var items = new ArrayList<Map<String, Object>>();
        for (CapabilityHandler handler : handlers.all()) {
            for (CapabilityDescriptor descriptor : handler.describe()) {
                if (!descriptor.readOnly()) continue;
                items.add(item(descriptor, handler.scope().id(), settings.enabled(descriptor.name())));
            }
        }
        return Map.of("items", List.copyOf(items), "source", "capability-handlers");
    }

    private Map<String, Object> item(CapabilityDescriptor descriptor, String scope, boolean enabled) {
        var row = new LinkedHashMap<String, Object>();
        row.put("id", descriptor.name());
        row.put("title", descriptor.title());
        row.put("kind", descriptor.kind().id());
        row.put("scope", scope);
        row.put("readOnly", descriptor.readOnly());
        row.put("enabled", enabled);
        row.put("invocation", invocationFor(descriptor.name()));
        row.put("summary", descriptor.summary());
        row.putAll(bindingFields(descriptor, enabled));
        return row;
    }

    private Map<String, Object> bindingFields(CapabilityDescriptor descriptor, boolean enabled) {
        var fields = new LinkedHashMap<String, Object>();
        if (!descriptor.hasBinary()) {
            fields.put("bindingStatus", enabled ? "ready" : "disabled");
            fields.put("bindingSource", "builtin");
            fields.put("binary", "");
            fields.put("resolvedPath", "");
            fields.put("versionStatus", "not_applicable");
            fields.put("bindingNote", enabled ? "" : "已停用；定义保留在目录中，不停用不等于删除。");
            return fields;
        }
        var channel = channels.channel(descriptor.name(), descriptor.binary());
        fields.put("bindingSource", channel.source());
        fields.put("binary", channel.binary() == null ? "" : channel.binary());
        fields.put("resolvedPath", channel.resolvedPath() == null ? "" : channel.resolvedPath());
        // Catalog render never runs --version; unknown until operator probes.
        fields.put("versionStatus", "unknown");
        if (!enabled) {
            fields.put("bindingStatus", "disabled");
            fields.put("bindingNote", "已停用快照：定义与绑定保留，调用入口拒绝执行。");
            return fields;
        }
        if (channel.availability() == CapabilityAvailability.MISSING_BINARY) {
            if (channel.overridden()) {
                fields.put("bindingStatus", "conflict");
                fields.put("bindingNote", "操作员覆盖路径不可用，未静默回退到随附二进制。");
            } else {
                fields.put("bindingStatus", "missing_binary");
                fields.put("bindingNote", "未找到可执行文件：" + channel.binary());
            }
            return fields;
        }
        fields.put("bindingStatus", "ready");
        fields.put("bindingNote", "二进制已解析；版本未知（目录不自动探测）。");
        return fields;
    }

    private static String invocationFor(String capability) {
        if ("git-status".equals(capability)) return "POST /api/runtime/trusted-tools/git-status/invoke";
        return "";
    }
}
