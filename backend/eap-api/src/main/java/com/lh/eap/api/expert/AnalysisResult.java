package com.lh.eap.api.expert;

import java.util.*;

public record AnalysisResult<T>(AnalysisStatus status, T result, double confidence, List<Finding> findings, List<Evidence> evidence, List<RequiredCapability> missingCapabilities) {
    public AnalysisResult { findings = List.copyOf(findings == null ? List.of() : findings); evidence = List.copyOf(evidence == null ? List.of() : evidence); missingCapabilities = List.copyOf(missingCapabilities == null ? List.of() : missingCapabilities); }
}
