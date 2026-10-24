package com.lh.eap.web.dto;

import java.util.List;
import java.util.UUID;

public record AiMessageResponse(UUID executionId, String answer, String error, String status, String approval,
                                String verification, List<AiToolEvent> toolEvents, String artifactError,
                                List<AiArtifactSummary> artifacts, com.lh.eap.ai.CodeChangeService.Proposal proposal) {
    public AiMessageResponse(UUID executionId, String answer, String error, String status, String approval,
            String verification, List<AiToolEvent> toolEvents, String artifactError, List<AiArtifactSummary> artifacts) {
        this(executionId, answer, error, status, approval, verification, toolEvents, artifactError, artifacts, null);
    }
    public record AiToolEvent(long sequence, String code) {}
    public record AiArtifactSummary(UUID artifactId, UUID executionId, String kind, long sizeBytes, String sha256) {}
}
