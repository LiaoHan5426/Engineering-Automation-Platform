package com.lh.eap.local;

import static org.junit.jupiter.api.Assertions.*;
import java.lang.reflect.Proxy;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalProcessIdentityInspectorTest {
    private static final Instant START = Instant.parse("2026-01-01T00:00:00Z");
    private final String binary = Path.of(System.getProperty("java.home"), "bin",
            System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();

    private ProcessHandle handle(Instant start, String command, boolean alive) {
        var info = (ProcessHandle.Info) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ProcessHandle.Info.class},
                (p, m, a) -> switch (m.getName()) {
                    case "startInstant" -> Optional.ofNullable(start);
                    case "command" -> Optional.ofNullable(command);
                    default -> throw new AssertionError("Unexpected metadata access " + m.getName());
                });
        return (ProcessHandle) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ProcessHandle.class},
                (p, m, a) -> switch (m.getName()) {
                    case "info" -> info;
                    case "isAlive" -> alive;
                    default -> throw new AssertionError("No enumeration or process mutation: " + m.getName());
                });
    }
    @Test void comparesStartTimeAndExecutableRatherThanTrustingPid() {
        var live = new LocalProcessIdentityInspector(pid -> Optional.of(handle(START, binary, true)));
        assertEquals("MATCHING_ALIVE", live.inspect(42L, START.toString(), binary).status());
        assertEquals("IDENTITY_MISMATCH", live.inspect(42L, START.minusSeconds(1).toString(), binary).status());
        assertEquals("IDENTITY_MISMATCH", live.inspect(42L, START.toString(), binary + ".other").status());
        assertEquals("UNVERIFIABLE", live.inspect(42L, null, binary).status());
        assertEquals("UNVERIFIABLE", live.inspect(42L, "bad date", binary).status());
        assertEquals("UNVERIFIABLE", live.inspect(42L, START.toString(), "").status());
        assertEquals("MATCHING_EXITED", new LocalProcessIdentityInspector(pid -> Optional.of(handle(START, binary, false)))
                .inspect(42L, START.toString(), binary).status());
    }
    @Test void missingIdentityOrAccessDoesNotBecomeExitEvidence() {
        var lookups = new AtomicInteger();
        var missing = new LocalProcessIdentityInspector(pid -> { lookups.incrementAndGet(); return Optional.empty(); });
        assertEquals("NOT_CAPTURED", missing.inspect(null, null, null).status());
        assertEquals("NOT_CAPTURED", missing.inspect(-1L, null, null).status());
        assertEquals(0, lookups.get());
        assertEquals("NOT_FOUND", missing.inspect(42L, START.toString(), binary).status());
        assertEquals("UNAVAILABLE", new LocalProcessIdentityInspector(pid -> { throw new SecurityException(); })
                .inspect(42L, START.toString(), binary).status());
        assertEquals("UNVERIFIABLE", new LocalProcessIdentityInspector(pid -> Optional.of(handle(null, null, true)))
                .inspect(42L, START.toString(), binary).status());
        var redacted = missing.inspect(42L, null, "token=fixture-secret " + "x".repeat(2000)).capturedExecutable();
        assertTrue(redacted.length() <= 1000); assertFalse(redacted.contains("fixture-secret"));
    }
    @Test void inspectsARealOwnedProcessWithoutTerminatingIt() throws Exception {
        var child = child("child", null);
        try {
            var info = child.info();
            var result = new LocalProcessIdentityInspector().inspect(child.pid(), info.startInstant().orElseThrow().toString(),
                    info.command().orElseThrow());
            assertEquals("MATCHING_ALIVE", result.status());
            assertTrue(child.isAlive(), "Inspection is read-only");
        } finally { child.destroyForcibly(); assertTrue(child.waitFor(5, TimeUnit.SECONDS)); }
    }
    @Test void aMissingRealParentDoesNotMeanItsOwnedChildExited(@TempDir Path temp) throws Exception {
        var identity = temp.resolve("child.identity");
        var parent = child("parent", identity);
        ProcessHandle orphan = null;
        try {
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
            while (!Files.exists(identity) && parent.isAlive() && System.nanoTime() < until) Thread.sleep(20);
            assertTrue(Files.exists(identity), "Parent publishes only its own child's identity");
            var captured = Files.readAllLines(identity);
            orphan = ProcessHandle.of(Long.parseLong(captured.get(0))).orElseThrow();
            var info = parent.info(); var parentId = parent.pid();
            var parentStart = info.startInstant().orElseThrow().toString();
            var parentCommand = info.command().orElseThrow();
            parent.destroyForcibly(); assertTrue(parent.waitFor(5, TimeUnit.SECONDS));
            var probe = new LocalProcessIdentityInspector();
            assertEquals("NOT_FOUND", probe.inspect(parentId, parentStart, parentCommand).status());
            assertTrue(orphan.isAlive(), "Parent exit does not prove descendant exit");
            assertEquals("MATCHING_ALIVE", probe.inspect(orphan.pid(), captured.get(1), captured.get(2)).status());
        } finally {
            parent.destroyForcibly(); parent.waitFor(5, TimeUnit.SECONDS);
            if (orphan != null) { orphan.destroyForcibly(); orphan.onExit().get(5, TimeUnit.SECONDS); }
        }
    }
    private Process child(String mode, Path identity) throws Exception {
        var args = new ArrayList<>(List.of(binary, "-cp", System.getProperty("java.class.path"), Child.class.getName(), mode));
        if (identity != null) args.add(identity.toString());
        return new ProcessBuilder(args).redirectOutput(ProcessBuilder.Redirect.DISCARD)
                .redirectError(ProcessBuilder.Redirect.DISCARD).start();
    }
    public static class Child {
        public static void main(String[] args) throws Exception {
            if (args[0].equals("parent")) {
                var binary = Path.of(System.getProperty("java.home"), "bin",
                        System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
                var child = new ProcessBuilder(binary, "-cp", System.getProperty("java.class.path"), Child.class.getName(), "child")
                        .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
                var info = child.info();
                var target = Path.of(args[1]); var ready = target.resolveSibling("ready.identity");
                Files.write(ready, List.of(Long.toString(child.pid()), info.startInstant().orElseThrow().toString(), info.command().orElseThrow()));
                Files.move(ready, target);
            }
            Thread.sleep(20000);
        }
    }
}
