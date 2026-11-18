package com.lh.eap.runtime.mcp.client;
import com.lh.eap.error.McpErrors;

import com.lh.eap.core.ProcessTree;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.ReentrantLock;

/** Bounded line transport. Protocol sessions own this process and its retained descendants. */
public final class StdioMcpTransport implements McpTransport {
    static final int MAX_FRAME_BYTES = 6 * 1024 * 1024;
    private static final Set<String> BASE_ENV = Set.of("path", "systemroot", "windir", "temp", "tmp", "tmpdir", "lang", "lc_all");
    private final Process process;
    private final ReentrantLock lock = new ReentrantLock();
    private final AtomicBoolean closed = new AtomicBoolean();
    private final Map<Long, ProcessHandle> descendants = new ConcurrentHashMap<>();
    private final ExecutorService io = Executors.newVirtualThreadPerTaskExecutor();

    private StdioMcpTransport(Process process) {
        this.process = process;
        // Discard, never retain or expose stderr (which can contain credentials).
        io.submit(() -> { try { process.getErrorStream().transferTo(OutputStream.nullOutputStream()); } catch (IOException ignored) {} });
        io.submit(() -> {
            while (!closed.get()) {
                process.descendants().forEach(p -> descendants.put(p.pid(), p));
                try { Thread.sleep(10); } catch (InterruptedException stopped) { return; }
            }
        });
    }

    static Map<String, String> environment(Map<String, String> inherited, Map<String, String> explicit) {
        var result = new HashMap<String, String>();
        inherited.forEach((key, value) -> { if (BASE_ENV.contains(key.toLowerCase(Locale.ROOT))) result.put(key, value); });
        // Explicit values come from server-owned configuration, never model arguments.
        if (explicit != null) result.putAll(explicit);
        return result;
    }

    public static StdioMcpTransport start(List<String> command, Path cwd) throws IOException {
        return start(command, cwd, Map.of());
    }

    public static StdioMcpTransport start(List<String> command, Path cwd, Map<String, String> explicit) throws IOException {
        Objects.requireNonNull(command);
        if (command.isEmpty()) throw new IllegalArgumentException(McpErrors.MCP_STDIO_COMMAND_REQUIRED.code());
        var builder = new ProcessBuilder(command);
        if (cwd != null) builder.directory(cwd.toRealPath().toFile());
        var clean = environment(builder.environment(), explicit);
        builder.environment().clear();
        builder.environment().putAll(clean);
        return new StdioMcpTransport(builder.start());
    }

    public boolean alive() { return process.isAlive(); }

    @Override public String exchange(String request, Duration timeout) throws IOException {
        Objects.requireNonNull(request); Objects.requireNonNull(timeout);
        long deadline = System.nanoTime() + timeout.toNanos();
        boolean acquired = false;
        Future<String> pending = null;
        try {
            acquired = lock.tryLock(Math.max(0, timeout.toNanos()), TimeUnit.NANOSECONDS);
            if (!acquired) throw new IOException(McpErrors.MCP_TIMEOUT.code());
            if (closed.get() || !process.isAlive()) throw new IOException(McpErrors.MCP_STDIO_CLOSED.code());
            byte[] bytes = request.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_FRAME_BYTES) throw new IOException(McpErrors.MCP_FRAME_LIMIT.code());
            pending = io.submit(() -> {
                var input = process.getOutputStream();
                input.write(bytes); input.write('\n'); input.flush();
                if (StdioMcpCommand.looksLikeNotification(request)) return "";
                var output = process.getInputStream();
                var line = new ByteArrayOutputStream();
                int total = 0;
                while (true) {
                    int next = output.read();
                    if (next < 0) throw new IOException(McpErrors.MCP_STDIO_EOF.code());
                    if (++total > MAX_FRAME_BYTES) throw new IOException(McpErrors.MCP_FRAME_LIMIT.code());
                    if (next == '\n') {
                        String value = line.toString(StandardCharsets.UTF_8).stripTrailing();
                        if (!value.isBlank()) return value;
                        line.reset();
                    } else line.write(next);
                }
            });
            return pending.get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        } catch (TimeoutException timeoutFailure) {
            close(); throw new IOException(McpErrors.MCP_TIMEOUT.code(), timeoutFailure);
        } catch (InterruptedException interrupted) {
            close(); Thread.currentThread().interrupt(); throw new IOException(McpErrors.MCP_STDIO_INTERRUPTED.code(), interrupted);
        } catch (ExecutionException failed) {
            close();
            if (failed.getCause() instanceof IOException failure) throw failure;
            throw new IOException(McpErrors.MCP_STDIO_IO.code(), failed.getCause());
        } finally {
            if (pending != null && !pending.isDone()) pending.cancel(true);
            if (acquired) lock.unlock();
        }
    }

    @Override public void close() {
        if (!closed.compareAndSet(false, true)) return;
        // Kill first: closing a buffered stream before killing can wait behind a blocked reader/writer.
        ProcessTree.terminate(process, descendants);
        io.shutdownNow();
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        try { process.waitFor(2, TimeUnit.SECONDS); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
        var handles = new ArrayList<>(descendants.values()); handles.add(process.toHandle());
        for (var handle : handles) try {
            handle.onExit().get(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
        } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); break; }
        catch (ExecutionException | TimeoutException ignored) { /* no claim of confirmed cleanup */ }
    }
}
