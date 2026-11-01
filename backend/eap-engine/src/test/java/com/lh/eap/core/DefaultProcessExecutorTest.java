package com.lh.eap.core;

import com.lh.eap.application.service.MissionRunOutcome;
import com.lh.eap.api.Observation;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DefaultProcessExecutorTest {
    @TempDir Path workspace;
    private List<String> command(String mode){
        return List.of(Path.of(System.getProperty("java.home"),"bin","java").toString(),
                "-cp",probeClasspath(),Emitter.class.getName(),mode);
    }
    private String probeClasspath() {
        try { return Path.of(Emitter.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toString(); }
        catch (java.net.URISyntaxException invalid) { throw new IllegalStateException(invalid); }
    }
    @Test void drainsBothStreamsWithoutDeadlockAndCapsOutput(){
        var result=new DefaultProcessExecutor(Duration.ofSeconds(5)).run("test",workspace,command("both"));
        assertTrue(result.success());
        assertEquals(true,result.metadata().get("processTreeCleanup"));
        assertEquals(true,result.metadata().get("truncated"));
        assertTrue(result.stdout().length()<1_050_000);
        assertTrue(result.stderr().length()<1_050_000);
    }
    @Test void cancelKillsTheProcessAndItsChildOnlyAfterTheyExit() throws Exception {
        var executor = new DefaultProcessExecutor(Duration.ofSeconds(20));
        var id = UUID.randomUUID();
        var parent = new AtomicLong();
        var started = new CountDownLatch(1);
        var observation = new AtomicReference<Observation>();
        var worker = new Thread(() -> observation.set(executor.runManaged(id, "probe", workspace, List.of(
                Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp", probeClasspath(), Parent.class.getName(), probeClasspath()), Map.of(), identity -> {
            parent.set((Long) identity.get("processPid"));
            started.countDown();
        })));
        worker.start();
        assertTrue(started.await(10, TimeUnit.SECONDS));
        Long child = null;
        var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline && child == null) {
            var handle = ProcessHandle.of(parent.get());
            if (handle.isPresent()) child = handle.get().descendants().map(ProcessHandle::pid).findFirst().orElse(null);
            Thread.sleep(30);
        }
        assertNotNull(child);
        executor.cancel(id);
        worker.join(10_000);
        assertFalse(worker.isAlive());
        assertFalse(ProcessHandle.of(parent.get()).map(ProcessHandle::isAlive).orElse(false));
        assertFalse(ProcessHandle.of(child).map(ProcessHandle::isAlive).orElse(false));
        assertEquals(true, observation.get().metadata().get("processTreeCleanup"));
        var outcome = MissionRunOutcome.from(String.valueOf(observation.get().metadata().get("executorStatus")), observation.get().metadata(), true);
        assertEquals("CANCELLED", outcome.status());
        assertEquals("进程树已清理", outcome.exitEvidence());
    }

    @Test void databaseFailureAfterStartDoesNotLeaveTheProcess() throws Exception {
        var executor = new DefaultProcessExecutor(Duration.ofSeconds(15));
        var pid = new AtomicLong();
        var failure = assertThrows(IllegalStateException.class, () -> executor.runManaged(UUID.randomUUID(), "probe", workspace,
                command("sleep"), Map.of(), identity -> {
                    pid.set((Long) identity.get("processPid"));
                    throw new IllegalStateException("identity write failed");
                }));
        assertEquals("identity write failed", failure.getMessage());
        assertFalse(ProcessHandle.of(pid.get()).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test void closingTheExecutorStopsARunningProcess() throws Exception {
        var executor = new DefaultProcessExecutor(Duration.ofSeconds(15));
        var pid = new AtomicLong();
        var started = new CountDownLatch(1);
        var worker = new Thread(() -> executor.runManaged(UUID.randomUUID(), "probe", workspace, command("sleep"), Map.of(),
                identity -> {
                    pid.set((Long) identity.get("processPid"));
                    started.countDown();
                }));
        worker.start();
        assertTrue(started.await(10, TimeUnit.SECONDS));
        executor.close();
        worker.join(10_000);
        assertFalse(worker.isAlive());
        assertFalse(ProcessHandle.of(pid.get()).map(ProcessHandle::isAlive).orElse(false));
    }

    @Test void terminatesTimedOutProcesses(){
        var started=System.nanoTime();
        var result=new DefaultProcessExecutor(Duration.ofMillis(300)).run("test",workspace,command("sleep"));
        assertEquals(124,result.exitCode());
        assertEquals(true,result.metadata().get("processExited"));
        assertEquals(true,result.metadata().get("processTreeCleanup"));
        assertEquals("TIMED_OUT", MissionRunOutcome.from("TIMED_OUT", result.metadata(), false).status());
        assertFalse(result.success());
        assertTrue(Duration.ofNanos(System.nanoTime()-started).toSeconds()<4);
    }
    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void survivingDescendantPreventsMissionTerminationEvenAfterParentExit(boolean destroyThrows) throws Exception {
        var process = mock(Process.class);
        var parent = mock(ProcessHandle.class);
        var child = mock(ProcessHandle.class);
        when(process.toHandle()).thenReturn(parent);
        if (destroyThrows) when(child.destroyForcibly()).thenThrow(new IllegalStateException("fixture termination failure"));
        when(parent.info()).thenReturn(mock(ProcessHandle.Info.class));
        when(process.getOutputStream()).thenReturn(OutputStream.nullOutputStream());
        when(process.getInputStream()).thenReturn(InputStream.nullInputStream());
        when(process.getErrorStream()).thenReturn(InputStream.nullInputStream());
        when(process.descendants()).thenAnswer(invocation -> java.util.stream.Stream.of(child));
        when(child.pid()).thenReturn(42L);
        when(child.isAlive()).thenReturn(true);
        when(child.onExit()).thenReturn(CompletableFuture.completedFuture(child));
        try (var builders = mockConstruction(ProcessBuilder.class, (builder, context) -> {
            when(builder.directory(any())).thenReturn(builder);
            when(builder.start()).thenReturn(process);
        }); var executor = new DefaultProcessExecutor()) {
            var result = assertDoesNotThrow(() -> executor.run("test", workspace, List.of("fixture")));
            assertFalse(result.success());
            assertEquals(-1, result.exitCode());
            assertEquals("CLEANUP_FAILED", result.stderr());
            assertEquals(true, result.metadata().get("processExited"));
            assertEquals(false, result.metadata().get("processTreeCleanup"));
            assertFalse(MissionRunOutcome.from("FAILED", result.metadata(), false).terminal());
            assertFalse(executor.snapshots().getFirst().cleanupComplete());
        }
    }

    @Test void startFailureRecordsThatNoProcessWasLaunched() {
        try (var executor = new DefaultProcessExecutor()) {
            var result = executor.run("test", workspace, List.of(workspace.resolve("missing-executable").toString()));
            assertEquals("FAILED", result.metadata().get("executorStatus"));
            assertEquals(true, result.metadata().get("processNotStarted"));
            assertEquals(false, result.metadata().get("processExited"));
            assertEquals(true, result.metadata().get("processTreeCleanup"));
            assertTrue(MissionRunOutcome.from("FAILED", result.metadata(), false).terminal());
        }
    }

    @Test void readerFailureRetainsUnconfirmedCleanupAndProcessIdentity() throws Exception {
        var process = mock(Process.class);
        var parent = mock(ProcessHandle.class);
        var child = mock(ProcessHandle.class);
        when(process.pid()).thenReturn(123L);
        when(process.toHandle()).thenReturn(parent);
        when(parent.info()).thenReturn(mock(ProcessHandle.Info.class));
        when(process.getOutputStream()).thenReturn(OutputStream.nullOutputStream());
        when(process.getInputStream()).thenReturn(new InputStream() {
            @Override public int read() throws java.io.IOException { throw new java.io.IOException("fixture read failure"); }
        });
        when(process.getErrorStream()).thenReturn(InputStream.nullInputStream());
        when(process.descendants()).thenAnswer(invocation -> java.util.stream.Stream.of(child));
        when(child.pid()).thenReturn(42L);
        when(child.isAlive()).thenReturn(true);
        when(child.onExit()).thenReturn(CompletableFuture.completedFuture(child));
        try (var builders = mockConstruction(ProcessBuilder.class, (builder, context) -> {
            when(builder.directory(any())).thenReturn(builder);
            when(builder.start()).thenReturn(process);
        }); var executor = new DefaultProcessExecutor()) {
            var result = executor.run("test", workspace, List.of("fixture"));
            assertEquals("FAILED", result.metadata().get("executorStatus"));
            assertEquals(123L, result.metadata().get("processPid"));
            assertEquals(false, result.metadata().get("processNotStarted"));
            assertEquals(true, result.metadata().get("processExited"));
            assertEquals(false, result.metadata().get("processTreeCleanup"));
            assertFalse(MissionRunOutcome.from("FAILED", result.metadata(), false).terminal());
        }
    }

    @Test void interruptedWorkerReportsWhetherItsTreeReallyExited() throws Exception {
        try (var executor = new DefaultProcessExecutor()) {
            var id = UUID.randomUUID();
            var pid = new AtomicLong();
            var started = new CountDownLatch(1);
            var observation = new AtomicReference<Observation>();
            var worker = new Thread(() -> observation.set(executor.runManaged(id, "test", workspace,
                    command("sleep"), Map.of(), identity -> {
                        pid.set((Long) identity.get("processPid"));
                        started.countDown();
                    })));
            worker.start();
            assertTrue(started.await(10, TimeUnit.SECONDS));
            worker.interrupt();
            worker.join(10_000);
            assertFalse(worker.isAlive());
            var result = observation.get();
            assertEquals(130, result.exitCode());
            assertEquals(false, result.metadata().get("processNotStarted"));
            assertEquals(pid.get(), result.metadata().get("processPid"));
            var cleaned = executor.status(id).orElseThrow().cleanupComplete();
            assertEquals(cleaned, result.metadata().get("processTreeCleanup"));
            assertEquals(cleaned, MissionRunOutcome.from(String.valueOf(result.metadata().get("executorStatus")), result.metadata(), true).terminal());
            ProcessHandle.of(pid.get()).ifPresent(handle -> {
                try { handle.onExit().get(5, TimeUnit.SECONDS); }
                catch (Exception failure) { fail(failure); }
            });
            assertFalse(ProcessHandle.of(pid.get()).map(ProcessHandle::isAlive).orElse(false));
        }
    }

    public static class Parent {
        public static void main(String[] args) throws Exception {
            var java = Path.of(System.getProperty("java.home"), "bin", "java").toString();
            new ProcessBuilder(java, "-cp", args[0], Sleeper.class.getName()).start();
            Thread.sleep(60_000);
        }
    }

    public static class Sleeper {
        public static void main(String[] args) throws Exception {
            Thread.sleep(60_000);
        }
    }

    public static class Emitter{
        public static void main(String[] args)throws Exception{
            if("sleep".equals(args[0])){Thread.sleep(10000);return;}
            var bytes=new byte[1024];java.util.Arrays.fill(bytes,(byte)'a');
            for(int i=0;i<2048;i++){System.out.write(bytes);System.err.write(bytes);}
        }
    }
}
