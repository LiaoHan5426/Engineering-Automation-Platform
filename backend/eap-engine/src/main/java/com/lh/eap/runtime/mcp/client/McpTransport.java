package com.lh.eap.runtime.mcp.client;

import java.io.IOException;
import java.time.Duration;

/**
 * A single JSON-RPC line transport for MCP. Production wiring may use stdio; tests use in-memory pairs.
 */
public interface McpTransport extends AutoCloseable {
    String exchange(String requestJson, Duration timeout) throws IOException;

    @Override
    void close();
}
