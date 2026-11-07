package com.lh.eap.application.service;

import com.lh.eap.domain.model.CapabilityDescriptor;
import com.lh.eap.runtime.handler.CapabilityHandler;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** TD-01: aggregate built-in capability handler definitions (no arbitrary execution surface). */
@Service
public class TrustedToolCatalogService {
    private final CapabilityHandlerRegistry handlers;
    private final CapabilitySettings settings;

    public TrustedToolCatalogService(CapabilityHandlerRegistry handlers, CapabilitySettings settings) {
        this.handlers = handlers;
        this.settings = settings;
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

    private static Map<String, Object> item(CapabilityDescriptor descriptor, String scope, boolean enabled) {
        var row = new LinkedHashMap<String, Object>();
        row.put("id", descriptor.name());
        row.put("title", descriptor.title());
        row.put("kind", descriptor.kind().id());
        row.put("scope", scope);
        row.put("readOnly", descriptor.readOnly());
        row.put("enabled", enabled);
        row.put("invocation", invocationFor(descriptor.name()));
        row.put("summary", descriptor.summary());
        return row;
    }

    private static String invocationFor(String capability) {
        if ("git-status".equals(capability)) return "POST /api/runtime/trusted-tools/git-status/invoke";
        return "";
    }
}
