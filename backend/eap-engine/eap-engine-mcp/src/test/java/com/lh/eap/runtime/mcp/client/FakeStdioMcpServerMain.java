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
        if (args.length > 0) {
            switch (args[0]) {
                case "partial" -> { System.out.print("{"); System.out.flush(); Thread.sleep(60000); return; }
                case "stderr" -> { System.err.write(new byte[2 * 1024 * 1024]); System.err.flush(); }
                case "oversize" -> { System.out.write(new byte[StdioMcpTransport.MAX_FRAME_BYTES + 1]); System.out.flush(); Thread.sleep(60000); return; }
                case "tree" -> {
                    var child = new ProcessBuilder(ProcessHandle.current().info().command().orElseThrow(), "-cp", System.getProperty("java.class.path"), FakeStdioMcpServerMain.class.getName(), "partial").redirectOutput(ProcessBuilder.Redirect.DISCARD).start();
                    System.out.println(child.pid()); System.out.flush(); Thread.sleep(60000); return;
                }
            }
        }
        var server = new InMemoryMcpServer(List.of(args.length > 0 && args[0].equals("memory") ? "read_graph" : "readonly.ping"));
        try (var reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             var writer = new BufferedWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                String response;
                var json = tools.jackson.databind.json.JsonMapper.builder().build();
                var request = json.readTree(line);
                if (args.length > 0 && args[0].equals("memory") && request.path("method").asString().equals("tools/call")
                        && request.path("params").path("name").asString().equals("read_graph")) {
                    response = json.writeValueAsString(java.util.Map.of("jsonrpc","2.0", "id", request.path("id").asString(),
                        "result",java.util.Map.of("content",List.of(java.util.Map.of("type","text","text","{\"entities\":[]}")),"isError",false)));
                } else response = server.handle(line);
                if (response == null || response.isBlank()) continue;
                writer.write(response);
                writer.newLine();
                writer.flush();
            }
        }
    }
}
