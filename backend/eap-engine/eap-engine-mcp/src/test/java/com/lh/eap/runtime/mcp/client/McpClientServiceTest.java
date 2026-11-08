package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.runtime.mcp.McpSessionRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class McpClientServiceTest {
    @Mock
    private McpServerRegistry registry;

    private final McpSessionRegistry sessions = new McpSessionRegistry();
    private McpClientService client;

    @BeforeEach
    void wire() {
        client = new McpClientService(registry, sessions);
    }

    @AfterEach
    void cleanup() {
        sessions.closeAll();
        client.clearInMemoryTransports();
    }

    @Test
    void completesInitializeListAndReadOnlyCall() {
        var execution = UUID.randomUUID();
        var serverId = "fixture";
        var capability = "mcp.fixture.readonly.ping";
        when(registry.publishes(capability)).thenReturn(true);
        when(registry.serverOf(capability)).thenReturn(Optional.of(serverId));
        client.wireInMemoryServer(serverId, List.of("readonly.ping"));
        sessions.beginExecution(execution, "orders-sql");

        var probe = client.probe(execution, "orders-sql", capability);
        assertEquals(serverId, probe.get("serverId"));
        assertTrue(probe.get("tools") instanceof List<?> tools && !tools.isEmpty());

        var result = client.callReadOnly(execution, "orders-sql", capability, Map.of());
        assertNotNull(result.get("content"));
        assertEquals(1, sessions.endExecution(execution));
        assertTrue(client.existing(execution, "orders-sql", serverId).isEmpty());
    }

    @Test
    void rejectsUnauthorizedCapability() {
        when(registry.publishes("mcp.fixture.readonly.ping")).thenReturn(false);
        var execution = UUID.randomUUID();
        sessions.beginExecution(execution, "orders-sql");
        client.wireInMemoryServer("fixture", List.of("readonly.ping"));
        var denied = assertThrows(ResponseStatusException.class,
                () -> client.callReadOnly(execution, "orders-sql", "mcp.fixture.readonly.ping", Map.of()));
        assertEquals(403, denied.getStatusCode().value());
    }

    @Test
    void timesOutAndClosesTransport() {
        var server = new InMemoryMcpServer(List.of("readonly.ping"));
        var clientStack = new McpProtocolClient(
                new InMemoryMcpTransport(new InMemoryMcpTransport.DelayingHandler(server, 50)), Duration.ofMillis(5));
        assertThrows(Exception.class, clientStack::initialize);
        server.close();
        assertTrue(server.closed());
    }
}
