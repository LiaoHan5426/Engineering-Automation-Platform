package com.lh.eap.runtime.mcp;

import com.lh.eap.domain.model.CapabilityAvailability;
import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.domain.model.CapabilityDescriptor;
import com.lh.eap.domain.model.CapabilityKind;
import com.lh.eap.domain.model.NodeResult;
import com.lh.eap.runtime.handler.CapabilityHandler;

import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * A stand-in for a registered MCP tool.
 *
 * <p>The runtime deliberately ships no MCP handler: a tool only exists once an operator registers a
 * server and allow-lists the tool, so {@code /api/capabilities} reports zero of them. That makes the
 * expert-scope contract untestable against real handlers, which is what this double is for ? and it
 * behaves like a real one on purpose: it opens its session through {@link McpSessionRegistry} using the
 * execution and the expert it was invoked for, and it refuses to run any other way.
 */
public class FakeMcpToolHandler implements CapabilityHandler {
    public static final String CAPABILITY = "mcp.registrydb.query";

    private final McpSessionRegistry sessions;
    public final List<McpCallScope> calls = new CopyOnWriteArrayList<>();
    public final List<ShapeSession> opened = new CopyOnWriteArrayList<>();

    public FakeMcpToolHandler(McpSessionRegistry sessions) {
        this.sessions = sessions;
    }

    @Override public Set<String> capabilities() { return Set.of(CAPABILITY); }

    @Override public CapabilityKind kind() { return CapabilityKind.MCP; }

    @Override public CapabilityAvailability availability() { return CapabilityAvailability.NOT_CONFIGURED; }

    @Override public List<CapabilityDescriptor> describe() {
        return List.of(new CapabilityDescriptor(CAPABILITY, kind(),
                "???????????", "??????? MCP ????????????",
                List.of("query"), List.of("??????" + CAPABILITY), "MCP ????????",
                List.of(), List.of("??????"), true));
    }

    @Override public NodeResult handle(CapabilityContext context) {
        var scope = McpCallScope.of(context.executionId(), context.expertId(), CAPABILITY).orElseThrow();
        var session = sessions.session(scope, () -> {
            var created = new ShapeSession(scope.serverId());
            opened.add(created);
            return created;
        });
        sessions.requireOwnership(scope, session);
        calls.add(scope);
        return new NodeResult(true, false, "??????????????" + scope.sessionKey(),
                Map.of("server", scope.serverId()));
    }

    /** An opaque session handle that records whether it was closed. */
    public static final class ShapeSession implements McpSessionRegistry.McpSession {
        private final String serverId;
        public boolean closed;

        public ShapeSession(String serverId) { this.serverId = serverId; }

        @Override public String serverId() { return serverId; }
        @Override public void close() { closed = true; }
    }
}
