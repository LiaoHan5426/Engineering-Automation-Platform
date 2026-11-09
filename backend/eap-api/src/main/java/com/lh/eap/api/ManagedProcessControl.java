package com.lh.eap.api;

import java.util.Map;

/** Per-invocation cancellation and evidence hooks, independent of HTTP and storage. */
public interface ManagedProcessControl {
    boolean cancellationRequested();
    void started(Map<String, Object> identity);
    /** Bounded cumulative descendant clues; never a complete process-tree or exit assertion. */
    default void descendantsObserved(Map<String, Object> evidence) {}
}
