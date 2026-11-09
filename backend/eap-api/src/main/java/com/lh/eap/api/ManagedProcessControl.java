package com.lh.eap.api;

import java.util.Map;

/** Per-invocation cancellation and evidence hooks, independent of HTTP and storage. */
public interface ManagedProcessControl {
    boolean cancellationRequested();
    void started(Map<String, Object> identity);
}
