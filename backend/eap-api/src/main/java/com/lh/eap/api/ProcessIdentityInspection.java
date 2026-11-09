package com.lh.eap.api;

import java.time.Instant;

/** One bounded read-only OS observation. It never proves that an entire process tree exited. */
public record ProcessIdentityInspection(Long pid, String status, Instant capturedStartedAt,
        Instant observedStartedAt, String capturedExecutable, String observedExecutable) {}
