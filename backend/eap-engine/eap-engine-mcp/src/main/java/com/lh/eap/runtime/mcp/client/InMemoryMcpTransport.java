package com.lh.eap.runtime.mcp.client;

import java.io.IOException;
import java.time.Duration;
import java.util.function.Function;

/**
 * Pairs a client line exchange with an in-process MCP server handler (tests and offline loops).
 */
public final class InMemoryMcpTransport implements McpTransport {
    private final Function<String, String> handler;
    private volatile boolean closed;

    public InMemoryMcpTransport(Function<String, String> handler) {
        this.handler = handler;
    }

    public static InMemoryMcpTransport loopback(InMemoryMcpServer server) {
        return new InMemoryMcpTransport(server::handle);
    }

    @Override
    public String exchange(String requestJson, Duration timeout) throws IOException {
        if (closed) throw new IOException("传输已关闭");
        var deadline = System.nanoTime() + timeout.toNanos();
        if (handler instanceof DelayingHandler delaying && delaying.delayMs() > 0) {
            if (System.nanoTime() + delaying.delayMs() * 1_000_000L > deadline) {
                throw new IOException("MCP_TIMEOUT");
            }
        }
        try {
            return handler.apply(requestJson);
        } catch (RuntimeException failure) {
            throw new IOException(failure.getMessage() == null ? "MCP_TRANSPORT_FAILED" : failure.getMessage(), failure);
        }
    }

    @Override
    public void close() {
        closed = true;
    }

    /** Test hook: transport that always exceeds the deadline. */
    public static final class DelayingHandler implements Function<String, String> {
        private final InMemoryMcpServer delegate;
        private final long delayMs;

        public DelayingHandler(InMemoryMcpServer delegate, long delayMs) {
            this.delegate = delegate;
            this.delayMs = delayMs;
        }

        public long delayMs() {
            return delayMs;
        }

        @Override
        public String apply(String line) {
            try {
                Thread.sleep(delayMs);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("MCP_DELAY_INTERRUPTED");
            }
            return delegate.handle(line);
        }
    }
}
