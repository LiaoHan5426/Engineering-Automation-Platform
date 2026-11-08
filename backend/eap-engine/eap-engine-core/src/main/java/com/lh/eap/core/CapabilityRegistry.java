package com.lh.eap.core;

import com.lh.eap.api.Capability;

import java.util.*;

public final class CapabilityRegistry {
    private final Map<String, Capability> capabilities = new LinkedHashMap<>();

    public CapabilityRegistry register(Capability capability) {
        capabilities.put(capability.name(), capability);
        return this;
    }

    public Capability require(String name) {
        var result = capabilities.get(name);
        if (result == null) throw new IllegalArgumentException("Unknown capability: " + name);
        return result;
    }

    public Collection<Capability> all() {
        return List.copyOf(capabilities.values());
    }
}
