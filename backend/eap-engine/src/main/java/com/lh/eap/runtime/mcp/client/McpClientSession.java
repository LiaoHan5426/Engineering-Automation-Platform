package com.lh.eap.runtime.mcp.client;

import com.lh.eap.runtime.mcp.McpSessionRegistry;

/** Live MCP transport session tied to one registered server id. */
public final class McpClientSession implements McpSessionRegistry.McpSession {
    private final String serverId;
    private final McpProtocolClient client;
    private volatile boolean closed;

    public McpClientSession(String serverId, McpProtocolClient client) {
        this.serverId = serverId;
        this.client = client;
    }

    public McpProtocolClient client() {
        if (closed) throw new IllegalStateException("MCP 会话已关闭");
        return client;
    }

    @Override
    public String serverId() {
        return serverId;
    }

    @Override
    public void close() {
        if (closed) return;
        closed = true;
        client.close();
    }

    public boolean closed() {
        return closed;
    }
}
