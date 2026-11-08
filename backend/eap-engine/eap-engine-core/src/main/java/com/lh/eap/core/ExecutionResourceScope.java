package com.lh.eap.core;

import java.util.*;

/** Acquires in composition order and releases in reverse order, including partial acquisition failure. */
public final class ExecutionResourceScope implements ExecutionResource.Scope {
    private final List<ExecutionResource.Scope> acquired = new ArrayList<>();
    private boolean closed;

    private ExecutionResourceScope() {}

    public static ExecutionResourceScope open(List<? extends ExecutionResource> resources, UUID executionId, String expertId) {
        var scope = new ExecutionResourceScope();
        try {
            for (var resource : resources) scope.acquired.add(Objects.requireNonNull(resource.open(executionId, expertId)));
            return scope;
        } catch (RuntimeException | Error failure) {
            try { scope.close(); } catch (RuntimeException | Error cleanup) { if (failure != cleanup) failure.addSuppressed(cleanup); }
            throw failure;
        }
    }

    @Override public void close() {
        if (closed) return;
        closed = true;
        Throwable failure = null;
        for (int i = acquired.size() - 1; i >= 0; i--) {
            try { acquired.get(i).close(); }
            catch (RuntimeException | Error cleanup) {
                if (failure == null) failure = cleanup;
                else if (failure != cleanup) failure.addSuppressed(cleanup);
            }
        }
        acquired.clear();
        if (failure instanceof RuntimeException runtime) throw runtime;
        if (failure instanceof Error error) throw error;
    }
}
