package com.lh.eap.api;

import java.util.Map;

public record Observation(String capability, boolean success, int exitCode, String stdout, String stderr,
                          Map<String, Object> metadata) {
    public Observation {
        stdout = stdout == null ? "" : stdout;
        stderr = stderr == null ? "" : stderr;
        metadata = Map.copyOf(metadata == null ? Map.of() : metadata);
    }
}
