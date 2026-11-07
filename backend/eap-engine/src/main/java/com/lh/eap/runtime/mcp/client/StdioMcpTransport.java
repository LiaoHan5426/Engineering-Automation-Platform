package com.lh.eap.runtime.mcp.client;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.TimeUnit;

/**
 * JSON-RPC line transport over a child process stdin/stdout. One request/response at a time.
 */
public final class StdioMcpTransport implements McpTransport {
    private final Process process;
    private final BufferedWriter stdin;
    private final BufferedReader stdout;
    private final Object lock = new Object();
    private volatile boolean closed;

    private StdioMcpTransport(Process process, BufferedWriter stdin, BufferedReader stdout) {
        this.process = process;
        this.stdin = stdin;
        this.stdout = stdout;
    }

    public static StdioMcpTransport start(List<String> command, Path workingDirectory) throws IOException {
        return start(command, workingDirectory, Map.of());
    }

    public static StdioMcpTransport start(List<String> command, Path workingDirectory, Map<String, String> extraEnv)
            throws IOException {
        Objects.requireNonNull(command, "command");
        if (command.isEmpty()) throw new IllegalArgumentException("MCP_STDIO_COMMAND_REQUIRED");
        var builder = new ProcessBuilder(command);
        if (workingDirectory != null) builder.directory(workingDirectory.toFile());
        builder.redirectError(ProcessBuilder.Redirect.PIPE);
        var env = builder.environment();
        // Do not inherit secrets; only pass explicit, non-secret overrides for the child.
        if (extraEnv != null) {
            for (var entry : extraEnv.entrySet()) {
                if (entry.getKey() == null || entry.getKey().isBlank()) continue;
                if (entry.getValue() == null) continue;
                env.put(entry.getKey(), entry.getValue());
            }
        }
        var process = builder.start();
        var stdin = new BufferedWriter(new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8));
        var stdout = new BufferedReader(new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
        return new StdioMcpTransport(process, stdin, stdout);
    }

    public boolean alive() {
        return process.isAlive();
    }

    @Override
    public String exchange(String requestJson, Duration timeout) throws IOException {
        if (closed || !process.isAlive()) throw new IOException("MCP_STDIO_CLOSED");
        Objects.requireNonNull(requestJson, "requestJson");
        Objects.requireNonNull(timeout, "timeout");
        synchronized (lock) {
            if (closed || !process.isAlive()) throw new IOException("MCP_STDIO_CLOSED");
            stdin.write(requestJson);
            stdin.newLine();
            stdin.flush();
            if (StdioMcpCommand.looksLikeNotification(requestJson)) {
                return "";
            }
            long deadline = System.nanoTime() + timeout.toNanos();
            while (System.nanoTime() < deadline) {
                if (!process.isAlive()) throw new IOException("MCP_STDIO_EXITED");
                if (stdout.ready()) {
                    var line = stdout.readLine();
                    if (line == null) throw new IOException("MCP_STDIO_EOF");
                    if (!line.isBlank()) return line;
                    continue;
                }
                try {
                    Thread.sleep(10);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IOException("MCP_STDIO_INTERRUPTED", interrupted);
                }
            }
            throw new IOException("MCP_TIMEOUT");
        }
    }

    @Override
    public void close() {
        closed = true;
        try {
            stdin.close();
        } catch (IOException ignored) {
            // best-effort
        }
        try {
            stdout.close();
        } catch (IOException ignored) {
            // best-effort
        }
        process.destroy();
        try {
            if (!process.waitFor(2, TimeUnit.SECONDS)) {
                process.destroyForcibly();
                process.waitFor(2, TimeUnit.SECONDS);
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            process.destroyForcibly();
        }
    }
}
