package com.lh.eap.runtime.mcp.client;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Subprocess MCP server for stdio transport tests. Reads one JSON-RPC line at a time from stdin.
 */
public final class FakeStdioMcpServerMain {
    private FakeStdioMcpServerMain() {}

    public static void main(String[] args) throws Exception {
        var server = new InMemoryMcpServer(List.of("readonly.ping"));
        try (var reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             var writer = new BufferedWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                var response = server.handle(line);
                if (response == null || response.isBlank()) continue;
                writer.write(response);
                writer.newLine();
                writer.flush();
            }
        }
    }
}
