package com.lh.eap.runtime.mcp.client;

import java.util.List;

/**
 * Locked official read-oriented MCP stdio package for MCP-01 contrast.
 * Does not claim production grant or http/sse support.
 */
public final class OfficialReadonlyMcpLock {
    /** npm package name (official Model Context Protocol sample server). */
    public static final String PACKAGE = "@modelcontextprotocol/server-everything";
    /** Pinned version verified against npm registry at lock time. */
    public static final String VERSION = "2.2.1";
    /** Prefer a low-side-effect tool when the package is available. */
    public static final String READONLY_TOOL = "echo";

    private OfficialReadonlyMcpLock() {}

    public static String packageAtVersion() {
        return PACKAGE + "@" + VERSION;
    }

    public static String endpoint() {
        return "npx -y " + packageAtVersion();
    }

    public static List<String> argv(String npxExecutable) {
        return List.of(npxExecutable, "-y", packageAtVersion());
    }
}
