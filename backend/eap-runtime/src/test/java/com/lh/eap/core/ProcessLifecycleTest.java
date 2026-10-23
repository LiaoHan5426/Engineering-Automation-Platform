package com.lh.eap.core;

import com.lh.eap.api.CliExecution.Status;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class ProcessLifecycleTest {
    @TempDir Path root;
    List<String> command(String... args){
        var result=new ArrayList<>(List.of(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-Dstdout.encoding=UTF-8","-Dstderr.encoding=UTF-8","-cp",probeClasspath(),Probe.class.getName()));
        result.addAll(List.of(args));return result;
    }
    static String probeClasspath() {
        try { return Path.of(Probe.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toString(); }
        catch (java.net.URISyntaxException invalid) { throw new IllegalStateException(invalid); }
    }
    void awaitRunning(DefaultProcessExecutor e,UUID id)throws Exception{
        long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(5);
        while(System.nanoTime()<until){if(e.status(id).map(s->s.status()==Status.RUNNING).orElse(false))return;Thread.sleep(10);}
        fail("Process did not start");
    }
    @Test void cancelIsIdempotentAndReleasesResources()throws Exception{
        try(var e=new DefaultProcessExecutor();var threads=Executors.newVirtualThreadPerTaskExecutor()){
            var id=UUID.randomUUID();var future=threads.submit(()->e.runManaged(id,"test",root,command("sleep"),Map.of()));
            awaitRunning(e,id);e.cancel(id);e.cancel(id);
            assertEquals(130,future.get(8,TimeUnit.SECONDS).exitCode());
            assertEquals(Status.CANCELLED,e.status(id).orElseThrow().status());
            assertEquals(Status.CANCELLED,e.cancel(id).orElseThrow().status());assertEquals(0,e.activeCount());
            assertTrue(e.status(id).orElseThrow().cleanupComplete());assertTrue(e.cancel(UUID.randomUUID()).isEmpty());
        }
    }
    @Test void concurrentOutputAndCompletedCancellationDoNotInterfere()throws Exception{
        try(var e=new DefaultProcessExecutor();var threads=Executors.newVirtualThreadPerTaskExecutor()){
            var a=UUID.randomUUID();var b=UUID.randomUUID();
            var fa=threads.submit(()->e.runManaged(a,"test",root,command("alpha"),Map.of()));
            var fb=threads.submit(()->e.runManaged(b,"test",root,command("beta"),Map.of()));
            assertEquals("alpha",fa.get(8,TimeUnit.SECONDS).stdout());assertEquals("beta",fb.get(8,TimeUnit.SECONDS).stdout());
            assertEquals(Status.SUCCEEDED,e.cancel(a).orElseThrow().status());assertEquals(0,e.activeCount());
        }
    }
    @Test void timeoutAndCancellationRaceHasOneTerminalState()throws Exception{
        try(var e=new DefaultProcessExecutor(Duration.ofMillis(200));var threads=Executors.newVirtualThreadPerTaskExecutor()){
            var id=UUID.randomUUID();var f=threads.submit(()->e.runManaged(id,"test",root,command("sleep"),Map.of()));
            awaitRunning(e,id);Thread.sleep(180);e.cancel(id);f.get(8,TimeUnit.SECONDS);
            var state=e.status(id).orElseThrow().status();assertTrue(state==Status.TIMED_OUT||state==Status.CANCELLED);
            assertEquals(state,e.cancel(id).orElseThrow().status());assertEquals(0,e.activeCount());
        }
    }
    @Test void cleansChildTreeOnCancel()throws Exception{
        try(var e=new DefaultProcessExecutor();var threads=Executors.newVirtualThreadPerTaskExecutor()){
            var pidFile=root.resolve("child.pid");var id=UUID.randomUUID();
            var f=threads.submit(()->e.runManaged(id,"test",root,command("child",pidFile.toString()),Map.of()));
            long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(6);
            while(!Files.exists(pidFile)&&System.nanoTime()<until)Thread.sleep(20);
            assertTrue(Files.exists(pidFile));long pid=Long.parseLong(Files.readString(pidFile));
            e.cancel(id);f.get(8,TimeUnit.SECONDS);
            assertFalse(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false));assertEquals(0,e.activeCount());
        }
    }
    @Test void closeCancelsOwnedExecution()throws Exception{
        var e=new DefaultProcessExecutor();
        try(var threads=Executors.newVirtualThreadPerTaskExecutor()){
            var id=UUID.randomUUID();var f=threads.submit(()->e.runManaged(id,"test",root,command("sleep"),Map.of()));
            awaitRunning(e,id);e.close();f.get(8,TimeUnit.SECONDS);assertEquals(0,e.activeCount());
            assertThrows(IllegalStateException.class,()->e.runManaged(UUID.randomUUID(),"test",root,command("x"),Map.of()));
        }finally{e.close();}
    }
    @Test void windowsUnicodeDirectoryAndBootstrapEnvironment()throws Exception{
        var dir=Files.createDirectory(root.resolve("中文 workspace"));
        var environment=new LinkedHashMap<String,String>();
        for(var key:List.of("SystemRoot","WINDIR","TEMP","TMP","PATH"))if(System.getenv(key)!=null)environment.put(key,System.getenv(key));
        environment.put("EAP_BUSINESS","allowed");
        try(var e=new DefaultProcessExecutor()){
            var result=e.runManaged(UUID.randomUUID(),"test",dir,command("env"),environment);
            assertTrue(result.success(),result.stderr());assertTrue(result.stdout().contains("allowed"));
            assertTrue(result.stdout().contains(dir.toString()));assertEquals(0,e.activeCount());
        }
    }
    public static class Probe{
        public static void main(String[]args)throws Exception{
            if(args[0].equals("env")){System.out.print(System.getenv("EAP_BUSINESS")+System.getProperty("user.dir"));return;}
            if(args[0].equals("sleep")){Thread.sleep(15000);return;}
            if(args[0].equals("child")){
                var p=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java.exe").toString(),"-cp",System.getProperty("java.class.path"),Probe.class.getName(),"sleep").start();
                var destination=Path.of(args[1]);
                var pending=destination.resolveSibling(destination.getFileName()+".pending");
                Files.writeString(pending,Long.toString(p.pid()));
                Files.move(pending,destination,StandardCopyOption.ATOMIC_MOVE);
                Thread.sleep(15000);return;
            }
            System.out.print(args[0]);
        }
    }
}
