package com.lh.eap.core;

import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class DefaultProcessExecutorTest {
    @TempDir Path workspace;
    private List<String> command(String mode){
        return List.of(Path.of(System.getProperty("java.home"),"bin","java").toString(),
                "-cp",System.getProperty("java.class.path"),Emitter.class.getName(),mode);
    }
    @Test void drainsBothStreamsWithoutDeadlockAndCapsOutput(){
        var result=new DefaultProcessExecutor(Duration.ofSeconds(5)).run("test",workspace,command("both"));
        assertTrue(result.success());
        assertEquals(true,result.metadata().get("truncated"));
        assertTrue(result.stdout().length()<1_050_000);
        assertTrue(result.stderr().length()<1_050_000);
    }
    @Test void terminatesTimedOutProcesses(){
        var started=System.nanoTime();
        var result=new DefaultProcessExecutor(Duration.ofMillis(300)).run("test",workspace,command("sleep"));
        assertEquals(124,result.exitCode());
        assertFalse(result.success());
        assertTrue(Duration.ofNanos(System.nanoTime()-started).toSeconds()<4);
    }
    public static class Emitter{
        public static void main(String[] args)throws Exception{
            if("sleep".equals(args[0])){Thread.sleep(10000);return;}
            var bytes=new byte[1024];java.util.Arrays.fill(bytes,(byte)'a');
            for(int i=0;i<2048;i++){System.out.write(bytes);System.err.write(bytes);}
        }
    }
}
