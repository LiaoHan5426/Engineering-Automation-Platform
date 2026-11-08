package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class McpToolListPaginationTest {

    @Test
    void listToolsFollowsNextCursorAcrossPages() {
        var names = IntStream.rangeClosed(1, 5).mapToObj(i -> "tool-" + i).toList();
        var server = new InMemoryMcpServer(names, 2);
        try (var transport = InMemoryMcpTransport.loopback(server)) {
            var client = new McpProtocolClient(transport, Duration.ofSeconds(5));
            client.initialize();
            var tools = client.listTools();
            assertEquals(5, tools.size());
            assertEquals(List.of("tool-1", "tool-2", "tool-3", "tool-4", "tool-5"),
                    tools.stream().map(row -> String.valueOf(row.get("name"))).toList());
            client.close();
        }
    }
}
