package com.lh.eap.web;

import java.util.List;

/**
 * The declared description of one capability.
 *
 * <p>Written by the handler itself, never inferred by the UI. An operator reading the catalog must be
 * able to answer seven questions without looking at code: what kind of thing is this, who may turn it
 * on, what must it be given, what must it be authorised for, what does it publish, what actually runs
 * it, and — for a local binary — which executable is expected.
 *
 * @param name     capability id referenced by expert manifests and rule packs
 * @param kind     how it is executed — see {@link CapabilityKind}
 * @param scope    whether the platform may enable it globally ({@link CapabilityScope#PLATFORM}) or only
 *                 a single expert may, through an explicit declaration and grant
 *                 ({@link CapabilityScope#EXPERT}). A {@code mcp}/{@code http} capability defaults to
 *                 expert scope and is never globally runnable
 * @param title    short human label
 * @param summary  one sentence on what it does and what it explicitly does not do
 * @param inputs   arguments the node/expert must supply
 * @param grants   authorisations consumed at run time (knowledge base, database profile, MCP tool, …)
 * @param executor what actually performs the work, e.g. {@code ProcessExecutor · git status}
 * @param binary   for a {@link CapabilityKind#CLI} capability, the executable it ships with; this is the
 *                 value an operator may override per machine ({@code CliChannels}), and it is declared
 *                 here — next to the code that invokes it — so the catalog never guesses. {@code null}
 *                 for every other kind
 * @param facts    structural facts this capability can publish (must be declared in the vocabulary);
 *                 a rule pack that references any of them therefore requires this capability
 * @param evidence evidence areas this capability contributes without publishing facts
 * @param readOnly true when the capability cannot mutate anything
 */
public record CapabilityDescriptor(String name, CapabilityKind kind, CapabilityScope scope, String title,
                                   String summary, List<String> inputs, List<String> grants, String executor,
                                   String binary, List<String> facts, List<String> evidence, boolean readOnly) {

    public CapabilityDescriptor {
        inputs = inputs == null ? List.of() : List.copyOf(inputs);
        grants = grants == null ? List.of() : List.copyOf(grants);
        facts = facts == null ? List.of() : List.copyOf(facts);
        evidence = evidence == null ? List.of() : List.copyOf(evidence);
        kind = kind == null ? CapabilityKind.COMMAND : kind;
        scope = scope == null ? kind.defaultScope() : scope;
        binary = binary == null || binary.isBlank() ? null : binary.trim();
    }

    /** Descriptor without an explicit scope: it is derived from the kind. */
    public CapabilityDescriptor(String name, CapabilityKind kind, String title, String summary,
                                List<String> inputs, List<String> grants, String executor,
                                List<String> facts, List<String> evidence, boolean readOnly) {
        this(name, kind, kind == null ? null : kind.defaultScope(), title, summary, inputs, grants,
                executor, null, facts, evidence, readOnly);
    }

    /** Descriptor without a binary: everything that is not a local CLI capability. */
    public CapabilityDescriptor(String name, CapabilityKind kind, CapabilityScope scope, String title,
                                String summary, List<String> inputs, List<String> grants, String executor,
                                List<String> facts, List<String> evidence, boolean readOnly) {
        this(name, kind, scope, title, summary, inputs, grants, executor, null, facts, evidence, readOnly);
    }

    /** A local CLI capability: it has a binary to locate, and its scope follows from the kind. */
    public CapabilityDescriptor(String name, CapabilityKind kind, String title, String summary,
                                List<String> inputs, List<String> grants, String executor, String binary,
                                List<String> facts, List<String> evidence, boolean readOnly) {
        this(name, kind, kind == null ? null : kind.defaultScope(), title, summary, inputs, grants,
                executor, binary, facts, evidence, readOnly);
    }

    /** Minimal honest description for a capability whose handler did not override {@link CapabilityHandler#describe()}. */
    public static CapabilityDescriptor of(String name, CapabilityKind kind) {
        return new CapabilityDescriptor(name, kind, kind == null ? null : kind.defaultScope(), name,
                "该能力尚未声明详细描述。", List.of(), List.of(),
                kind == CapabilityKind.CLI ? "ProcessExecutor" : "运行时内置", null, List.of(), List.of(), true);
    }

    /** True when only an expert that declared it may run it. */
    public boolean expertScoped() { return scope == CapabilityScope.EXPERT; }

    /** True when this capability needs a local executable, and therefore has a channel to manage. */
    public boolean hasBinary() { return kind == CapabilityKind.CLI && binary != null; }
}
