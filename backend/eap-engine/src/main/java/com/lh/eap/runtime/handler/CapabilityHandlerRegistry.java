package com.lh.eap.runtime.handler;

import com.lh.eap.application.service.CapabilitySettings;
import com.lh.eap.domain.model.CapabilityScope;
import com.lh.eap.domain.model.ExpertManifest;

import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Name → handler lookup for the runtime.
 *
 * <p>Replaces the hard-coded {@code switch (capability)} that used to live in the executor.
 *
 * <p>It is also the place where "globally enabled" is stopped. {@link #find(String)} answers the
 * platform question — is there an implementation? — and is what the catalog reports.
 * {@link #resolveFor(ExpertManifest, String)} answers the execution question — may <em>this</em> expert
 * run it, right now? — and refuses two things: an expert-scoped capability (MCP tool, remote endpoint)
 * that the expert did not declare, and any capability the operator switched off in
 * {@link CapabilitySettings}. Handlers are shared stateless beans, so a platform capability cannot leak
 * state between experts; an expert-scoped one carries an external session, which is why it must be
 * authorized per expert rather than registered globally.
 */
@Component
public class CapabilityHandlerRegistry {
    private final Map<String, CapabilityHandler> handlers = new LinkedHashMap<>();
    private final CapabilitySettings settings;
    private final CliOperationHandler dynamicCli;

    /** Registry with no operator switches — every registered capability is runnable. */
    public CapabilityHandlerRegistry(List<CapabilityHandler> beans) {
        this(beans, null);
    }

    @Autowired
    public CapabilityHandlerRegistry(List<CapabilityHandler> beans, CapabilitySettings settings) {
        this.settings = settings;
        this.dynamicCli = beans.stream().filter(CliOperationHandler.class::isInstance).map(CliOperationHandler.class::cast).findFirst().orElse(null);
        for (var bean : beans) {
            if (bean instanceof CliOperationHandler) continue;
            for (var capability : bean.capabilities()) {
                var previous = handlers.put(capability, bean);
                if (previous != null) {
                    throw new IllegalStateException("能力被重复注册：" + capability);
                }
            }
        }
    }

    /** Is there an implementation for this capability? Says nothing about who may run it. */
    public Optional<CapabilityHandler> find(String capability) {
        var handler = handlers.get(capability);
        if (handler == null && dynamicCli != null && dynamicCli.capabilities().contains(capability)) handler = dynamicCli;
        return Optional.ofNullable(handler);
    }

    /**
     * May this expert run this capability?
     *
     * <p>Platform capabilities: yes, if an implementation exists and the operator has not switched it
     * off. Expert-scoped capabilities: only when the expert's manifest declares them — the declaration is
     * the authorization, and it is what activation records and what the graph validator checks.
     *
     * <p>A disabled capability resolves to nothing here rather than to an empty implementation: the
     * caller reports "not authorized/disabled", and a node never appears to have run while doing nothing.
     */
    public Optional<CapabilityHandler> resolveFor(ExpertManifest manifest, String capability) {
        var handler = find(capability).orElse(null);
        if (handler == null || disabled(capability)) return Optional.empty();
        if (handler.scope() != CapabilityScope.EXPERT) return Optional.of(handler);
        return manifest != null && manifest.expertScopedCapabilities().contains(capability)
                ? Optional.of(handler) : Optional.empty();
    }

    /** True when an operator switched this capability off. Absent settings mean enabled. */
    public boolean disabled(String capability) {
        return settings != null && !settings.enabled(capability);
    }

    public CapabilityScope scopeOf(String capability) {
        var handler = handlers.get(capability);
        return handler == null ? CapabilityScope.PLATFORM : handler.scope();
    }

    public Set<String> names() {
        var result = new LinkedHashSet<>(handlers.keySet());
        if (dynamicCli != null) result.addAll(dynamicCli.capabilities());
        return Set.copyOf(result);
    }

    /** Capabilities that are runnable by any expert that references them. */
    public Set<String> platformNames() {
        var result = new TreeSet<String>();
        if (dynamicCli != null) result.addAll(dynamicCli.capabilities());
        for (var entry : handlers.entrySet()) {
            if (entry.getValue().scope() == CapabilityScope.PLATFORM) result.add(entry.getKey());
        }
        return result;
    }

    /**
     * Capabilities that exist but must be declared by an expert before they can run. A registered MCP
     * tool is present here from the moment its server is declared — and is <em>not</em> part of
     * {@link #names()} semantics for validation purposes, which is exactly why the graph validator needs
     * both sets.
     */
    public Set<String> expertScopedNames() {
        var result = new TreeSet<String>();
        for (var entry : handlers.entrySet()) {
            if (entry.getValue().scope() == CapabilityScope.EXPERT) result.add(entry.getKey());
        }
        return result;
    }

    public Collection<CapabilityHandler> all() {
        var result = new LinkedHashSet<>(handlers.values());
        if (dynamicCli != null) result.add(dynamicCli);
        return List.copyOf(result);
    }
}
