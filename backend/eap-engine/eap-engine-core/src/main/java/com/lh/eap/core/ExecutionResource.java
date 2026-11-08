package com.lh.eap.core;

import java.util.UUID;

/** One execution's resource lifetime. Acquiring it must not grant capabilities or perform business calls. */
@FunctionalInterface
public interface ExecutionResource {
    /** On failure, release any state created by this resource before throwing. */
    Scope open(UUID executionId, String expertId);

    @FunctionalInterface
    interface Scope extends AutoCloseable {
        @Override void close();
    }
}
