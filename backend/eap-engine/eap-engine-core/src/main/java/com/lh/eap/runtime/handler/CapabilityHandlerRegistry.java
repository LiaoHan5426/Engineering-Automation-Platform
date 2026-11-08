package com.lh.eap.runtime.handler;

import com.lh.eap.core.CapabilitySwitches;
import com.lh.eap.domain.model.CapabilityScope;
import com.lh.eap.domain.model.ExpertManifest;
import java.util.*;

/** One capability registry; contributions never bypass switches or expert authorization. */
public class CapabilityHandlerRegistry {
    private final List<CapabilityHandler> contributions;
    private final Map<String,CapabilityHandler> fixed = new LinkedHashMap<>();
    private final CapabilitySwitches settings;
    public CapabilityHandlerRegistry(List<CapabilityHandler> beans) { this(beans, null); }
    public CapabilityHandlerRegistry(List<CapabilityHandler> beans, CapabilitySwitches settings) {
        this.contributions = List.copyOf(beans);
        this.settings = settings;
        for (var handler : contributions) if (!handler.dynamicCapabilities())
            for (var name : handler.capabilities()) register(fixed, name, handler);
    }
    private static void register(Map<String,CapabilityHandler> map, String name, CapabilityHandler handler) {
        if (map.putIfAbsent(name, handler) != null) throw new IllegalStateException("能力被重复注册：" + name);
    }
    private Map<String,CapabilityHandler> current() {
        var map = new LinkedHashMap<>(fixed);
        for (var handler : contributions) if (handler.dynamicCapabilities())
            for (var name : handler.capabilities()) register(map, name, handler);
        return map;
    }
    public Optional<CapabilityHandler> find(String name) { return Optional.ofNullable(current().get(name)); }
    public Optional<CapabilityHandler> resolveFor(ExpertManifest manifest, String name) {
        var handler = find(name).orElse(null);
        if (handler == null || disabled(name)) return Optional.empty();
        return handler.scope() != CapabilityScope.EXPERT || manifest != null && manifest.expertScopedCapabilities().contains(name)
                ? Optional.of(handler) : Optional.empty();
    }
    public boolean disabled(String name) { return settings != null && !settings.enabled(name); }
    public CapabilityScope scopeOf(String name) { return find(name).map(CapabilityHandler::scope).orElse(CapabilityScope.PLATFORM); }
    public Set<String> names() { return Set.copyOf(current().keySet()); }
    private Set<String> scoped(CapabilityScope scope) {
        var names = new TreeSet<String>();
        current().forEach((name,handler) -> { if (handler.scope() == scope) names.add(name); });
        return names;
    }
    public Set<String> platformNames() { return scoped(CapabilityScope.PLATFORM); }
    public Set<String> expertScopedNames() { return scoped(CapabilityScope.EXPERT); }
    public Collection<CapabilityHandler> all() { return contributions; }
}
