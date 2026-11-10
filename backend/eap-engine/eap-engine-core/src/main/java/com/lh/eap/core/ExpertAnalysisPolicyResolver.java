package com.lh.eap.core;

import com.lh.eap.domain.model.ExpertManifest;
import java.util.List;
import java.util.Optional;

/** Host-owned policy selection from the loaded expert definition, never from request-supplied policy ids. */
@FunctionalInterface
public interface ExpertAnalysisPolicyResolver {
    /** Empty means unsupported; callers must reject before opening execution resources or invoking tools. */
    Optional<ExpertAnalysisPolicy> resolve(ExpertManifest expert);

    default List<ExpertBehaviorCatalog.Descriptor> behaviors() { return List.of(); }

    default Optional<ExpertBehaviorCatalog.Descriptor> describe(ExpertManifest expert) {
        var binding = expert.behavior();
        return behaviors().stream().filter(item -> item.binding().equals(binding)).findFirst();
    }

}
