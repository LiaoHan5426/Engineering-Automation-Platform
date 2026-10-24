package com.lh.eap.application.service;

import java.time.Instant;
import java.util.UUID;

/** A mission shell linked to one handoff. Fixed fields are not execution, approval, or a grant. */
public record Mission(
        UUID id,
        UUID handoffId,
        String source,
        String sourceRef,
        String summary,
        String status,
        String execution,
        String approval,
        String grant,
        String verification,
        Instant createdAt) {}
