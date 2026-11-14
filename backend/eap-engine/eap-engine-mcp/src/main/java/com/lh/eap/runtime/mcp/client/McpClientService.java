package com.lh.eap.runtime.mcp.client;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import com.lh.eap.error.ExecutionErrors;
import com.lh.eap.error.McpErrors;
import com.lh.eap.error.ToolErrors;

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

    private final com.lh.eap.core.CapabilitySwitches switches;
    @org.springframework.beans.factory.annotation.Autowired
    public McpClientService(McpServerRegistry registry, McpSessionRegistry sessions, com.lh.eap.core.CapabilitySwitches switches) {
        this.registry = registry;
        this.sessions = sessions;
        this.switches = Objects.requireNonNull(switches);
    }
    /** Isolated protocol fixtures have no application capability switch store. */
    public McpClientService(McpServerRegistry registry,McpSessionRegistry sessions){this(registry,sessions,capability->true);}

    /** Tests and in-process transports register a supplier keyed by MCP server id. */
    public void registerInMemoryTransport(String serverId, Supplier<McpTransport> factory) {
        inMemoryTransports.put(Objects.requireNonNull(serverId), Objects.requireNonNull(factory));
    }

    public void clearInMemoryTransports() {
        inMemoryTransports.clear();
    }

    public Map<String, Object> probe(UUID executionId, String expertId, String capability) {
        var scope = McpCallScope.of(executionId, expertId, capability)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, McpErrors.INVALID_MCP_CAPABILITY.code()));
        authorize(scope);
        var session = openSession(scope);
        try {
            var init = Map.of("initialized", true);
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
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, McpErrors.INVALID_MCP_CAPABILITY.code()));
        var tool = toolName(scope.serverId(), capability);
        authorize(scope);
        ensureReadOnly(tool);
        ensureProductionGrant(scope.serverId(), tool);
        var session = openSession(scope);
        try {
            if (!(session.client().listTools().stream().anyMatch(item -> tool.equals(String.valueOf(item.get("name")))))) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, ToolErrors.TOOL_NOT_PUBLISHED.code());
            }
            sessions.requireOwnership(scope, session);
            return session.client().callTool(tool, arguments == null ? Map.of() : arguments);
        } finally {
            sessions.requireOwnership(scope, session);
        }
    }

    public McpServerRegistry registry() { return registry; }

    record Mapped(String serverId, long revision, String endpoint, String transport, McpOperationBinding binding) {
        String capability(){return McpServerRegistry.capabilityId(serverId,binding.tool());}
    }
    Mapped mapped(String serverId, McpOperationBinding.Operation operation) {
        var config=registry.operationBindings(serverId);
        var binding=config.bindings().stream().filter(b->b.operation()==operation).findFirst().orElseThrow(()->
                new ResponseStatusException(HttpStatus.FORBIDDEN,McpErrors.MCP_TOOL_NOT_AUTHORIZED.code()));
        return new Mapped(serverId,config.revision(),config.endpoint(),config.transport(),binding);
    }
    boolean mappedAuthorized(Mapped selected, java.util.function.BooleanSupplier live) {
        try{authorizeMapped(selected,live);return true;}catch(RuntimeException denied){return false;}
    }
    private void authorizeMapped(Mapped selected, java.util.function.BooleanSupplier live) {
        var current=mapped(selected.serverId(),selected.binding().operation());
        var server=registry.find(selected.serverId()).orElseThrow();
        if(!live.getAsBoolean() || !switches.enabled(selected.capability()) || Thread.currentThread().isInterrupted() || !selected.equals(current)
                || !selected.binding().approved() || !server.usable() || !server.endpoint().equals(selected.endpoint())
                || !server.transport().equals(selected.transport()) || !server.tools().contains(selected.binding().tool())
                || !registry.grants(selected.binding().expertId()).contains(selected.capability()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,McpErrors.MCP_TOOL_NOT_AUTHORIZED.code());
    }
    Map<String,Object> callMapped(UUID executionId, Mapped selected, Map<String,Object> arguments,
                                  java.util.function.BooleanSupplier live) {
        authorizeMapped(selected,live);
        var scope=new McpCallScope(executionId,selected.binding().expertId(),selected.serverId(),selected.capability());
        var session=openSession(scope);
        var tools=session.client().listTools().stream().filter(t->selected.binding().tool().equals(t.get("name"))).toList();
        if(tools.size()!=1 || !selected.binding().inputSchema().equals(tools.getFirst().get("inputSchema")))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,ToolErrors.TOOL_NOT_PUBLISHED.code());
        authorizeMapped(selected,live);sessions.requireOwnership(scope,session);
        var result=session.client().callTool(selected.binding().tool(),arguments);
        authorizeMapped(selected,live);sessions.requireOwnership(scope,session);
        return result;
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
            try {
                opened.client().initialize();
                return opened;
            } catch (RuntimeException failure) {
                opened.close();
                throw failure;
            }
        });
        sessions.requireOwnership(scope, session);
        return session;
    }

    private McpTransport transportFor(String serverId) {
        var factory = inMemoryTransports.get(serverId);
        if (factory != null) return factory.get();
        var server = registry.find(serverId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, McpErrors.MCP_SERVER_NOT_FOUND.code()));
        if (!server.usable()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, McpErrors.MCP_SERVER_NOT_USABLE.code());
        }
        var transport = server.transport() == null ? "" : server.transport().trim().toLowerCase();
        try {
            if ("stdio".equals(transport)) {
                var argv = new ArrayList<>(StdioMcpCommand.parse(server.endpoint()));
                if (McpProductionAllowlist.matchesOfficialReadonly(server.endpoint())) {
                    // Runtime calls never install packages or prompt. Installation is an operator action.
                    argv.set(1, "--offline"); argv.add(2, "--no");
                }
                return StdioMcpTransport.start(argv, Path.of("").toAbsolutePath().normalize());
            }
            if ("http".equals(transport)) {
                return HttpMcpTransport.connect(server.endpoint());
            }
            if ("sse".equals(transport)) {
                return SseMcpTransport.connect(server.endpoint());
            }
            if ("streamable-http".equals(transport) || "streamable_http".equals(transport)) {
                return StreamableHttpMcpTransport.connect(server.endpoint());
            }
            throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED, McpErrors.MCP_TRANSPORT_UNSUPPORTED.code());
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, invalid.getMessage());
        } catch (IOException failure) {
            var code = switch (transport) {
                case "stdio" -> McpErrors.MCP_STDIO_START_FAILED.code();
                case "http" -> McpErrors.MCP_HTTP_START_FAILED.code();
                case "sse" -> McpErrors.MCP_SSE_START_FAILED.code();
                case "streamable-http", "streamable_http" -> McpErrors.MCP_STREAMABLE_HTTP_START_FAILED.code();
                default -> McpErrors.MCP_TRANSPORT_START_FAILED.code();
            };
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, code);
        }
    }

    private void authorize(McpCallScope scope) {
        if (!registry.publishes(scope.capability())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, McpErrors.MCP_TOOL_NOT_AUTHORIZED.code());
        }
        if (registry.serverOf(scope.capability()).filter(scope.serverId()::equals).isEmpty()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, McpErrors.MCP_SERVER_MISMATCH.code());
        }
    }

    private static String toolName(String serverId, String capability) {
        var prefix = "mcp." + serverId + ".";
        if (!capability.startsWith(prefix)) return "";
        return capability.substring(prefix.length());
    }

    private static void ensureReadOnly(String tool) {
        if (tool.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ExecutionErrors.INVALID_TOOL.code());
        var lowered = tool.toLowerCase();
        if (lowered.contains("write") || lowered.contains("delete") || lowered.contains("exec")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, McpErrors.MCP_TOOL_NOT_READ_ONLY.code());
        }
    }

    private void ensureProductionGrant(String serverId, String tool) {
        var server = registry.find(serverId).orElse(null);
        // Explicit in-process fixtures are never registered through HTTP.
        if (inMemoryTransports.containsKey(serverId)) return;
        if (server == null) throw new ResponseStatusException(HttpStatus.FORBIDDEN, McpErrors.MCP_SERVER_NOT_FOUND.code());
        if (!McpProductionAllowlist.productionGranted(server.endpoint(), tool)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, McpErrors.MCP_PRODUCTION_TOOL_NOT_ALLOWED.code());
        }
    }

    /** Convenience for tests: wire an in-memory read-only server and return granted capability id. */
    public String wireInMemoryServer(String serverId, List<String> tools) {
        var server = new InMemoryMcpServer(new LinkedHashSet<>(tools));
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
