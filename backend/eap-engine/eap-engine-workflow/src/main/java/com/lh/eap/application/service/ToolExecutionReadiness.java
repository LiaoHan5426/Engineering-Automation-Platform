package com.lh.eap.application.service;

import java.time.Instant;
import java.util.UUID;

/** Read-only, current execution conditions. Neither grants access nor resolves an unknown outcome. */
public record ToolExecutionReadiness(String capabilityId, boolean scopeAccessible, boolean authorized,
        boolean canStart, String reason, UUID blockingExecutionId, String blockingStatus, Instant checkedAt) {}
