package com.lh.eap.web;

import java.util.List;
import java.util.Set;

/**
 * A pluggable deterministic capability.
 *
 * <p>Implementations are Spring beans. Registering a new capability means adding one bean — the
 * executor, the manifest validator and the catalog never change. Every handler must be bounded,
 * observable and free of hidden network or filesystem side effects (see AGENTS.md).
 *
 * <p>A handler also declares <em>what kind of thing it is</em> ({@link #kind()}), <em>who may turn it
 * on</em> ({@link #scope()}), how to describe it ({@link #describe()}) and whether its external
 * dependency is present right now ({@link #availability()}). That metadata is what turns the capability
 * catalog from a list of names into something an operator can reason about.
 */
public interface CapabilityHandler {
    /** Capability names this handler serves. */
    Set<String> capabilities();

    NodeResult handle(CapabilityContext context);

    /** How this handler is executed. Defaults to an in-process platform command. */
    default CapabilityKind kind() { return CapabilityKind.COMMAND; }

    /**
     * Whether the platform may enable this capability for every expert, or only for an expert that
     * declared it.
     *
     * <p>Defaults to the kind's scope: commands and local binaries are platform-level, MCP tools and
     * remote endpoints are expert-level and are never globally runnable.
     */
    default CapabilityScope scope() { return kind().defaultScope(); }

    /** Declared metadata for the catalog. Override to be useful; the default stays honest. */
    default List<CapabilityDescriptor> describe() {
        return capabilities().stream().map(name -> CapabilityDescriptor.of(name, kind())).toList();
    }

    /**
     * Whether the external dependency is present right now. Only handlers backed by an external
     * process or service need to override this; everything else is always available.
     */
    default CapabilityAvailability availability() { return CapabilityAvailability.AVAILABLE; }
}
