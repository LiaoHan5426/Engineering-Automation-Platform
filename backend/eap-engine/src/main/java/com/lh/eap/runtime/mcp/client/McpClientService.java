package com.lh.eap.runtime.mcp.client;

import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.runtime.mcp.McpCallScope;
import com.lh.eap.runtime.mcp.McpSessionRegistry;
import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Read-only MCP client wired to {@link McpServerRegistry} authorization and {@link McpSessionRegistry} isolation.
 */
@Service
public class McpClientService {
    private final McpServerRegistry registry;
    private final McpSessionRegistry sessions;
    private final Map<String, Supplier<McpTransport>> inMemoryTransports = new ConcurrentHashMap<>();
    private final Duration callTimeout = Duration.ofSeconds(5);

    public McpClientService(McpServerRegistry registry, McpSessionRegistry sessions) {
        this.registry = registry;
        this.sessions = sessions;
    }

    /** Tests and in-process transports register a supplier keyed by MCP server id. */
    public void registerInMemoryTransport(String serverId, Supplier<McpTransport> factory) {
        inMemoryTransports.put(Objects.requireNonNull(serverId), Objects.requireNonNull(factory));
    }

    public void clearInMemoryTransports() {
        inMemoryTransports.clear();
    }

    public Map<String, Object> probe(UUID executionId, String expertId, String capability) {
        var scope = McpCallScope.of(executionId, expertId, capability)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_MCP_CAPABILITY"));
        authorize(scope);
        var session = openSession(scope);
        try {
            var init = session.client().initialize();
            var tools = session.client().listTools();
            return Map.of(
                    "serverId", scope.serverId(),
                    "capability", capability,
                    "initialized", init,
                    "tools", tools);
        } finally {
            sessions.requireOwnership(scope, session);
        }
    }

    public Map<String, Object> callReadOnly(UUID executionId, String expertId, String capability,
                                            Map<String, Object> arguments) {
        var scope = McpCallScope.of(executionId, expertId, capability)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_MCP_CAPABILITY"));
        var tool = toolName(scope.serverId(), capability);
        authorize(scope);
        ensureReadOnly(tool);
        var session = openSession(scope);
        try {
            if (!(session.client().listTools().stream().anyMatch(item -> tool.equals(String.valueOf(item.get("name")))))) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "TOOL_NOT_PUBLISHED");
            }
            sessions.requireOwnership(scope, session);
            return session.client().callTool(tool, arguments == null ? Map.of() : arguments);
        } finally {
            sessions.requireOwnership(scope, session);
        }
    }

    public void beginExecution(UUID executionId, String expertId) {
        sessions.beginExecution(executionId, expertId);
    }

    public int endExecution(UUID executionId) {
        return sessions.endExecution(executionId);
    }

    private McpClientSession openSession(McpCallScope scope) {
        var session = (McpClientSession) sessions.session(scope, () -> {
            var transport = transportFor(scope.serverId());
            var client = new McpProtocolClient(transport, callTimeout);
            var opened = new McpClientSession(scope.serverId(), client);
            opened.client().initialize();
            return opened;
        });
        sessions.requireOwnership(scope, session);
        return session;
    }

    private McpTransport transportFor(String serverId) {
        var factory = inMemoryTransports.get(serverId);
        if (factory != null) return factory.get();
        var server = registry.find(serverId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "MCP_SERVER_NOT_FOUND"));
        if (!server.usable()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MCP_SERVER_NOT_USABLE");
        }
        var transport = server.transport() == null ? "" : server.transport().trim().toLowerCase();
        try {
            if ("stdio".equals(transport)) {
                var argv = StdioMcpCommand.parse(server.endpoint());
                return StdioMcpTransport.start(argv, Path.of("").toAbsolutePath().normalize());
            }
            if ("http".equals(transport)) {
                return HttpMcpTransport.connect(server.endpoint());
            }
            throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED, "MCP_TRANSPORT_UNSUPPORTED");
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, invalid.getMessage());
        } catch (IOException failure) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "stdio".equals(transport) ? "MCP_STDIO_START_FAILED" : "MCP_HTTP_START_FAILED");
        }
    }

    private void authorize(McpCallScope scope) {
        if (!registry.publishes(scope.capability())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MCP_TOOL_NOT_AUTHORIZED");
        }
        if (registry.serverOf(scope.capability()).filter(scope.serverId()::equals).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MCP_SERVER_MISMATCH");
        }
    }

    private static String toolName(String serverId, String capability) {
        var prefix = "mcp." + serverId + ".";
        if (!capability.startsWith(prefix)) return "";
        return capability.substring(prefix.length());
    }

    private static void ensureReadOnly(String tool) {
        if (tool.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_TOOL");
        var lowered = tool.toLowerCase();
        if (lowered.contains("write") || lowered.contains("delete") || lowered.contains("exec")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "MCP_TOOL_NOT_READ_ONLY");
        }
    }

    /** Convenience for tests: wire an in-memory read-only server and return granted capability id. */
    public String wireInMemoryServer(String serverId, List<String> tools) {
        var server = new InMemoryMcpServer(new java.util.LinkedHashSet<>(tools));
        registerInMemoryTransport(serverId, () -> InMemoryMcpTransport.loopback(server));
        return tools.stream().map(tool -> McpServerRegistry.capabilityId(serverId, tool)).findFirst().orElse("");
    }

    public Optional<McpClientSession> existing(UUID executionId, String expertId, String serverId) {
        var capability = registry.allowedTools(serverId).stream().findFirst()
                .map(tool -> McpServerRegistry.capabilityId(serverId, tool))
                .orElse(null);
        if (capability == null) return Optional.empty();
        return sessions.existing(new McpCallScope(executionId, expertId, serverId, capability))
                .filter(McpClientSession.class::isInstance)
                .map(McpClientSession.class::cast);
    }
}
