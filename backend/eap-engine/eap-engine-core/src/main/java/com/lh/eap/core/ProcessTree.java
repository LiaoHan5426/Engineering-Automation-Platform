package com.lh.eap.core;

import java.util.Map;

/** Shared best-effort termination; callers retain handles and report unconfirmed cleanup. */
public final class ProcessTree {
    private ProcessTree() {}
    public static boolean terminate(Process process, Map<Long, ProcessHandle> descendants) {
        boolean attempted = true;
        if (process != null) try { process.descendants().forEach(p -> descendants.put(p.pid(), p)); }
        catch (RuntimeException failure) { attempted = false; }
        for (var child : descendants.values()) try { child.destroyForcibly(); }
        catch (RuntimeException failure) { attempted = false; }
        if (process != null) try { if (process.isAlive()) process.destroyForcibly(); }
        catch (RuntimeException failure) { attempted = false; }
        return attempted;
    }
}
