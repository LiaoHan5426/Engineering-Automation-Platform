package com.lh.eap.core;

import com.lh.eap.api.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

public final class DefaultProcessExecutor implements ProcessExecutor {
    private final Duration timeout;
    private static final int OUTPUT_LIMIT=1024*1024;
    public DefaultProcessExecutor(){this(Duration.ofSeconds(20));}
    public DefaultProcessExecutor(Duration timeout){
        if(timeout.isNegative()||timeout.isZero())throw new IllegalArgumentException("timeout must be positive");
        this.timeout=timeout;
    }
    public Observation run(String capability,Path dir,List<String> command){
        Process process=null;
        var readers=Executors.newVirtualThreadPerTaskExecutor();
        try{
            process=new ProcessBuilder(command).directory(dir.toFile()).start();
            var running=process;
            var stdout=readers.submit(()->read(running.getInputStream()));
            var stderr=readers.submit(()->read(running.getErrorStream()));
            var completed=process.waitFor(timeout.toMillis(),TimeUnit.MILLISECONDS);
            if(!completed){terminate(process);process.waitFor(2,TimeUnit.SECONDS);}
            var out=stdout.get(3,TimeUnit.SECONDS);var err=stderr.get(3,TimeUnit.SECONDS);
            return new Observation(capability,completed&&process.exitValue()==0,completed?process.exitValue():124,
                    out.text(),completed?err.text():"Process timed out. "+err.text(),
                    Map.of("command",List.copyOf(command),"timeoutMillis",timeout.toMillis(),"truncated",out.truncated()||err.truncated()));
        }catch(InterruptedException error){
            if(process!=null)terminate(process);Thread.currentThread().interrupt();
            return new Observation(capability,false,130,"","Interrupted",Map.of());
        }catch(IOException|ExecutionException|TimeoutException error){
            if(process!=null)terminate(process);
            return new Observation(capability,false,-1,"","Process execution failed: "+error.getClass().getSimpleName(),Map.of());
        }finally{
            if(process!=null){
                if(process.isAlive())terminate(process);
                try{process.getInputStream().close();process.getErrorStream().close();}catch(IOException ignored){}
            }
            readers.shutdownNow();
        }
    }
    private static void terminate(Process process){
        process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();
    }
    private record Output(String text,boolean truncated){}
    private static Output read(InputStream stream)throws IOException{
        var output=new ByteArrayOutputStream();var buffer=new byte[8192];int length;boolean truncated=false;
        while((length=stream.read(buffer))!=-1){
            int retain=Math.min(length,OUTPUT_LIMIT-output.size());
            if(retain>0)output.write(buffer,0,retain);
            if(retain<length)truncated=true;
        }
        var text=output.toString(StandardCharsets.UTF_8);
        return new Output(truncated?text+"\n[output truncated at 1 MiB]":text,truncated);
    }
}
