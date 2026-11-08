package com.lh.eap.runtime.mcp.client;

import java.util.List;

/**
 * Compatibility facade over {@link OfficialReadonlyMcpMatrix#primary()} for existing callers and tests.
 */
public final class OfficialReadonlyMcpLock {
    public static final String PACKAGE = OfficialReadonlyMcpMatrix.primary().packageName();
    public static final String VERSION = OfficialReadonlyMcpMatrix.primary().version();
    public static final String READONLY_TOOL = OfficialReadonlyMcpMatrix.primary().preferredTool();

    private OfficialReadonlyMcpLock() {}

    public static String packageAtVersion() {
        return OfficialReadonlyMcpMatrix.primary().packageAtVersion();
    }

    public static String endpoint() {
        return OfficialReadonlyMcpMatrix.primary().endpoint();
    }

    public static List<String> argv(String npxExecutable) {
        return OfficialReadonlyMcpMatrix.primary().argv(npxExecutable);
    }

    public static List<String> readonlyTools() {
        return OfficialReadonlyMcpMatrix.primary().readonlyTools();
    }
}
