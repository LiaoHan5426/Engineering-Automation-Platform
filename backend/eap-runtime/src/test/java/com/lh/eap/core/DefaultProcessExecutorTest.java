package com.lh.eap.core;

import com.lh.eap.application.service.MissionRunOutcome;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

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
        assertEquals(true,result.metadata().get("truncated"));
        assertTrue(result.stdout().length()<1_050_000);
        assertTrue(result.stderr().length()<1_050_000);
    }
    @Test void cancelKillsTheProcessAndItsChildOnlyAfterTheyExit() throws Exception {
        var executor = new DefaultProcessExecutor(Duration.ofSeconds(20));
        var id = UUID.randomUUID();
        var parent = new AtomicLong();
        var started = new CountDownLatch(1);
        var worker = new Thread(() -> executor.runManaged(id, "probe", workspace, List.of(
                Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                "-cp", probeClasspath(), Parent.class.getName(), probeClasspath()), Map.of(), identity -> {
            parent.set((Long) identity.get("processPid"));
            started.countDown();
        }));
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
        assertFalse(ProcessHandle.of(parent.get()).map(ProcessHandle::isAlive).orElse(false));
        assertFalse(ProcessHandle.of(child).map(ProcessHandle::isAlive).orElse(false));
        var outcome = MissionRunOutcome.from("CANCELLED", Map.of("processExited", true, "processNotStarted", false), true);
        assertEquals("CANCELLED", outcome.status());
        assertEquals("进程已退出", outcome.exitEvidence());
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
        assertFalse(result.success());
        assertTrue(Duration.ofNanos(System.nanoTime()-started).toSeconds()<4);
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
