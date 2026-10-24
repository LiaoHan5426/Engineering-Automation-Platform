package com.lh.eap.application.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Stored canonical content. There is no update operation. */
public record PrototypeVersion(
        UUID id,
        String sourceRef,
        String title,
        String body,
        int buttonPresses,
        String interaction,
        List<String> acceptance,
        String contentHash,
        Instant createdAt) {}
