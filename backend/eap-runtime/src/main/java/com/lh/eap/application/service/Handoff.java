package com.lh.eap.application.service;

import java.time.Instant;
import java.util.UUID;

/** A recorded intent. The fixed fields are not an execution result or a grant. */
public record Handoff(
        UUID id,
        String source,
        String sourceRef,
        String summary,
        String status,
        String execution,
        String approval,
        String grant,
        Instant createdAt) {}
