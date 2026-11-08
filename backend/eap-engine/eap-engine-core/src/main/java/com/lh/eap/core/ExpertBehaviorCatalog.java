package com.lh.eap.core;

import com.lh.eap.domain.model.ExpertBehaviorBinding;
import com.lh.eap.domain.model.ExpertManifest;
import java.util.*;

/** Immutable host composition of analysis policies; does not register tools or execute workflows. */
public final class ExpertBehaviorCatalog implements ExpertAnalysisPolicyResolver {
    public record Registration(ExpertBehaviorBinding binding, String name, ExpertAnalysisPolicy policy,
                               String executionMode, Set<String> allowedTools, Set<String> requiredTools) {
        public Registration(ExpertBehaviorBinding binding, String name, ExpertAnalysisPolicy policy, String executionMode, Set<String> allowedTools) {
            this(binding, name, policy, executionMode, allowedTools, Set.of());
        }
        public Registration(ExpertBehaviorBinding binding, String name, ExpertAnalysisPolicy policy) {
            this(binding, name, policy, "fixed-workflow", Set.of());
        }
        public Registration {
            Objects.requireNonNull(binding);
            Objects.requireNonNull(policy);
            if (name == null || name.isBlank()) throw new IllegalArgumentException("Behavior name is required");
            if (!Set.of("fixed-workflow", "agent").contains(executionMode)) throw new IllegalArgumentException("Unsupported execution mode");
            allowedTools = Set.copyOf(allowedTools);
            requiredTools = Set.copyOf(requiredTools);
            if (!allowedTools.containsAll(requiredTools)) throw new IllegalArgumentException("Required tools must be allowed");
            if (executionMode.equals("agent") && allowedTools.isEmpty()) throw new IllegalArgumentException("Agent tools are required");
        }
    }
    public record Descriptor(ExpertBehaviorBinding binding, String name, String executionMode, Set<String> allowedTools, Set<String> requiredTools) { }

    private final Map<ExpertBehaviorBinding, ExpertAnalysisPolicy> policies;
    private final List<Descriptor> descriptors;
    private final ExpertBehaviorBinding legacy;

    public ExpertBehaviorCatalog(List<Registration> registrations, ExpertBehaviorBinding legacy) {
        var entries = new LinkedHashMap<ExpertBehaviorBinding, ExpertAnalysisPolicy>();
        var names = new ArrayList<Descriptor>();
        for (var registration : registrations) {
            if (entries.putIfAbsent(registration.binding(), registration.policy()) != null) {
                throw new IllegalArgumentException("Duplicate expert behavior binding: " + registration.binding());
            }
            names.add(new Descriptor(registration.binding(), registration.name(), registration.executionMode(), registration.allowedTools(), registration.requiredTools()));
        }
        this.legacy = Objects.requireNonNull(legacy);
        if (!entries.containsKey(legacy)) throw new IllegalArgumentException("Legacy behavior is not registered");
        this.policies = Map.copyOf(entries);
        this.descriptors = List.copyOf(names);
    }

    @Override public Optional<ExpertAnalysisPolicy> resolve(ExpertManifest expert) {
        return Optional.ofNullable(policies.get(expert.behavior() == null ? legacy : expert.behavior()));
    }
    @Override public Optional<ExpertBehaviorBinding> legacyBinding() { return Optional.of(legacy); }
    @Override public List<Descriptor> behaviors() { return descriptors; }
}
