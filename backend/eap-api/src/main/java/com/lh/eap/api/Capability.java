package com.lh.eap.api;

public interface Capability {
    String name();

    Observation execute(ExecutionContext context, String... args);
}
