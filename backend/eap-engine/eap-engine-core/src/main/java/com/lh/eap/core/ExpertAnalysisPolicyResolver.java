package com.lh.eap.core;

import com.lh.eap.domain.model.ExpertManifest;
import com.lh.eap.domain.model.ExpertBehaviorBinding;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

/** Host-owned policy selection from the loaded expert definition, never from request-supplied policy ids. */
@FunctionalInterface
public interface ExpertAnalysisPolicyResolver {
    /** Empty means unsupported; callers must reject before opening execution resources or invoking tools. */
    Optional<ExpertAnalysisPolicy> resolve(ExpertManifest expert);

    default Optional<ExpertBehaviorBinding> legacyBinding() { return Optional.empty(); }

    default List<ExpertBehaviorCatalog.Descriptor> behaviors() { return List.of(); }

    default Optional<ExpertBehaviorCatalog.Descriptor> describe(ExpertManifest expert) {
        var binding = expert.behavior() == null ? legacyBinding().orElse(null) : expert.behavior();
        return behaviors().stream().filter(item -> item.binding().equals(binding)).findFirst();
    }

    /** Explicit compatibility choice for a host whose existing experts all use the same analysis domain. */
    static ExpertAnalysisPolicyResolver fixed(ExpertAnalysisPolicy policy) {
        Objects.requireNonNull(policy);
        return expert -> expert.behavior() == null ? Optional.of(policy) : Optional.empty();
    }
}
