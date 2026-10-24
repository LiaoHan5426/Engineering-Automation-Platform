package com.lh.eap.application.service;

import java.time.Instant;
import java.util.UUID;

/** A review sheet for one prototype version. It does not bind a repository or start an agent. */
public record PrototypeDelivery(UUID id, UUID versionId, Instant createdAt) {}
