package com.lh.eap.application.service;

import com.lh.eap.api.ProcessIdentityInspection;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Ephemeral review clues, separate from durable execution/exit evidence and human attestation. */
public record ToolProcessReview(UUID executionId, String capabilityId, String executionStatus,
        Instant observedAt, boolean completeProcessTreeEvidence, boolean truncated, List<Step> steps) {
    public ToolProcessReview { steps = List.copyOf(steps); }
    public record Step(UUID stepId, String phase, ProcessIdentityInspection process,
                       boolean descendantsCaptured, boolean descendantsTruncated,
                       List<ProcessIdentityInspection> descendants) {
        public Step { descendants = List.copyOf(descendants); }
        public Step(UUID stepId, String phase, ProcessIdentityInspection process) {
            this(stepId, phase, process, false, false, List.of());
        }
    }
}
