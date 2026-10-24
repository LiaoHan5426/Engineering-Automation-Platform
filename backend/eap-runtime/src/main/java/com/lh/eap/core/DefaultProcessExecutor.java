package com.lh.eap.core;

import com.lh.eap.api.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;

public class DefaultProcessExecutor implements ProcessExecutor, AutoCloseable {
    private static final class Execution {
        final UUID id;
        volatile CliExecution.Status status=CliExecution.Status.CREATED;
        volatile boolean cleanupComplete;
        volatile boolean released;
        Process process;
        Map<String,Object> identity=Map.of();
        Execution(UUID id){this.id=id;}
        CliExecution.Snapshot snapshot(){return new CliExecution.Snapshot(id,status,cleanupComplete);}
    }
    private final Map<UUID,Execution> executions=new LinkedHashMap<>();
    private boolean closed;
    @Override public synchronized Optional<CliExecution.Snapshot> status(UUID id){
        return Optional.ofNullable(executions.get(id)).map(Execution::snapshot);
    }
    @Override public synchronized Optional<CliExecution.Snapshot> cancel(UUID id){
        var execution=executions.get(id);
        if(execution==null)return Optional.empty();
        synchronized(execution){
            if(execution.status==CliExecution.Status.CREATED||execution.status==CliExecution.Status.RUNNING)
                execution.status=CliExecution.Status.CANCELLING;
            return Optional.of(execution.snapshot());
        }
    }
    @Override public void close(){
        synchronized(this){closed=true;for(var execution:executions.values())cancel(execution.id);}
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);
        while(System.nanoTime()<deadline){
            synchronized(this){if(executions.values().stream().allMatch(e->e.released))return;}
            try{Thread.sleep(20);}catch(InterruptedException e){Thread.currentThread().interrupt();return;}
        }
    }
    public synchronized int activeCount(){return (int)executions.values().stream().filter(e->!e.released).count();}
    public synchronized List<CliExecution.Snapshot> snapshots(){return executions.values().stream().map(Execution::snapshot).toList();}
    @Override public Observation runManaged(UUID id,String capability,Path dir,List<String> command,Map<String,String> environment){
        return runManaged(id,capability,dir,command,environment,null);
    }
    public Observation runManaged(UUID id,String capability,Path dir,List<String> command,Map<String,String> environment,
                                  java.util.function.Consumer<Map<String,Object>> onStart){
        return execute(id,capability,dir,command,Map.copyOf(environment),onStart);
    }
    private final Duration timeout;
    private static final int OUTPUT_LIMIT=1024*1024;
    public DefaultProcessExecutor(){this(Duration.ofSeconds(20));}
    public DefaultProcessExecutor(Duration timeout){
        if(timeout.isNegative()||timeout.isZero())throw new IllegalArgumentException("timeout must be positive");
        this.timeout=timeout;
    }
    public Observation run(String capability,Path dir,List<String> command){
        return execute(UUID.randomUUID(),capability,dir,command,null,null);
    }
    @Override public Observation runIsolated(String capability,Path dir,List<String> command,Map<String,String> environment){
        return execute(UUID.randomUUID(),capability,dir,command,Map.copyOf(environment),null);
    }
    private Observation execute(UUID id,String capability,Path dir,List<String> command,Map<String,String> environment,
                                java.util.function.Consumer<Map<String,Object>> onStart){
        var execution=new Execution(id);
        synchronized(this){
            if(closed)throw new IllegalStateException("Executor closed");
            if(executions.containsKey(id))throw new IllegalArgumentException("Duplicate execution ID");
            if(executions.size()>=256)executions.entrySet().removeIf(e->e.getValue().released);
            if(executions.size()>=256)throw new IllegalStateException("Execution capacity reached");
            executions.put(id,execution);
        }
        Process process=null;
        var descendants=new LinkedHashMap<Long,ProcessHandle>();
        var readers=Executors.newVirtualThreadPerTaskExecutor();
        var phases=new LinkedHashMap<String,Instant>();
        try{
            var builder=new ProcessBuilder(command).directory(dir.toFile());
            if(environment!=null){builder.environment().clear();builder.environment().putAll(environment);}
            synchronized(execution){
                if(execution.status==CliExecution.Status.CANCELLING){
                    execution.status=CliExecution.Status.CANCELLED;
                    return new Observation(capability,false,130,"","Cancelled before start",Map.of("processExited",false,"processNotStarted",true,"executorStatus","CANCELLED"));
                }
                process=builder.start();execution.process=process;execution.status=CliExecution.Status.RUNNING;
                phases.put("started",Instant.now());
                execution.identity=identityOf(process,command);
            }
            if(onStart!=null) onStart.accept(execution.identity);
            process.getOutputStream().close();
            var running=process;
            var stdout=readers.submit(()->read(running.getInputStream()));
            var stderr=readers.submit(()->read(running.getErrorStream()));
            long deadline=System.nanoTime()+timeout.toNanos();
            while(process.isAlive()){
                process.descendants().forEach(p->descendants.put(p.pid(),p));
                synchronized(execution){
                    if(execution.status==CliExecution.Status.CANCELLING){execution.status=CliExecution.Status.CANCELLED;phases.put("cancelled",Instant.now());break;}
                    if(System.nanoTime()>=deadline){execution.status=CliExecution.Status.TIMED_OUT;phases.put("timedOut",Instant.now());break;}
                }
                process.waitFor(20,TimeUnit.MILLISECONDS);
            }
            if(!process.isAlive())phases.put("exitObserved",Instant.now());
            synchronized(execution){
                if(execution.status==CliExecution.Status.CANCELLING)execution.status=CliExecution.Status.CANCELLED;
                if(execution.status==CliExecution.Status.RUNNING)execution.status=process.exitValue()==0?CliExecution.Status.SUCCEEDED:CliExecution.Status.FAILED;
            }
            process.descendants().forEach(p->descendants.put(p.pid(),p));
            phases.put("cleanupStarted",Instant.now());
            descendants.values().forEach(ProcessHandle::destroyForcibly);
            if(process.isAlive())terminate(process);
            process.waitFor(2,TimeUnit.SECONDS);
            for(var child:descendants.values())try{child.onExit().get(2,TimeUnit.SECONDS);}catch(ExecutionException|TimeoutException ignored){}
            boolean cleaned=!process.isAlive()&&descendants.values().stream().noneMatch(ProcessHandle::isAlive);
            if(!process.isAlive())phases.putIfAbsent("exitObserved",Instant.now());
            var out=stdout.get(3,TimeUnit.SECONDS);var err=stderr.get(3,TimeUnit.SECONDS);
            process.getInputStream().close();process.getErrorStream().close();readers.shutdownNow();
            phases.put("cleanupFinished",Instant.now());
            if(!cleaned)execution.status=CliExecution.Status.FAILED;
            var code=execution.status==CliExecution.Status.TIMED_OUT?124:execution.status==CliExecution.Status.CANCELLED?130:cleaned?process.exitValue():-1;
            var metadata=new LinkedHashMap<String,Object>();
            metadata.put("command",List.copyOf(command));
            metadata.put("timeoutMillis",timeout.toMillis());
            metadata.put("truncated",out.truncated()||err.truncated());
            metadata.put("processExited",!process.isAlive());
            metadata.put("processNotStarted",false);
            metadata.put("executorStatus",execution.status.name());
            if(execution.identity!=null) metadata.putAll(execution.identity);
            metadata.put("trace",new CliExecution.Trace(phases,out.lines(),err.text(),out.truncated()||err.truncated(),""));
            return new Observation(capability,execution.status==CliExecution.Status.SUCCEEDED,code,
                    out.text(),cleaned?err.text():"CLEANUP_FAILED",metadata);
        }catch(InterruptedException error){
            execution.status=CliExecution.Status.CANCELLED;
            if(process!=null)terminate(process);Thread.currentThread().interrupt();
            return new Observation(capability,false,130,"","Interrupted",Map.of());
        }catch(IOException|ExecutionException|TimeoutException error){
            execution.status=CliExecution.Status.FAILED;
            if(process!=null)terminate(process);
            return new Observation(capability,false,-1,"","Process execution failed: "+error.getClass().getSimpleName(),Map.of());
        }finally{
            descendants.values().forEach(ProcessHandle::destroyForcibly);
            if(process!=null){
                if(process.isAlive())terminate(process);
                try{process.getInputStream().close();process.getErrorStream().close();process.getOutputStream().close();}catch(IOException ignored){}
            }
            readers.shutdownNow();
            synchronized(execution){
                execution.cleanupComplete=(process==null||!process.isAlive())&&descendants.values().stream().noneMatch(ProcessHandle::isAlive);
                execution.process=null;execution.released=true;
                if(!execution.cleanupComplete)execution.status=CliExecution.Status.FAILED;
            }
        }
    }
    private static Map<String,Object> identityOf(Process process,List<String> command){
        var handle=process.toHandle().info();
        var identity=new LinkedHashMap<String,Object>();
        identity.put("processPid",process.pid());
        identity.put("processStartedAt",handle.startInstant().map(Instant::toString).orElse(""));
        identity.put("processUser",handle.user().orElse(""));
        var executable=handle.command().filter(value->!value.isBlank())
                .orElse(command.isEmpty()?"":command.get(0));
        identity.put("processExecutable",executable);
        return identity;
    }
    private static void terminate(Process process){
        process.descendants().forEach(ProcessHandle::destroyForcibly);process.destroyForcibly();
    }
    private record Output(String text,boolean truncated,List<CliExecution.ReceivedLine> lines){}
    private static Output read(InputStream stream)throws IOException{
        var output=new ByteArrayOutputStream();var buffer=new byte[8192];int length;boolean truncated=false;
        var lines=new ArrayList<CliExecution.ReceivedLine>();var pending=new ByteArrayOutputStream();
        while((length=stream.read(buffer))!=-1){
            int retain=Math.min(length,OUTPUT_LIMIT-output.size());
            for(int i=0;i<retain;i++){
                if(buffer[i]=='\n'){
                    if(lines.size()<16384)lines.add(new CliExecution.ReceivedLine(lines.size()+1,Instant.now(),pending.toString(StandardCharsets.UTF_8)));
                    else truncated=true;
                    pending.reset();
                }else pending.write(buffer[i]);
            }
            if(retain>0)output.write(buffer,0,retain);
            if(retain<length)truncated=true;
        }
        var text=output.toString(StandardCharsets.UTF_8);
        if(pending.size()>0)lines.add(new CliExecution.ReceivedLine(lines.size()+1,Instant.now(),pending.toString(StandardCharsets.UTF_8)));
        return new Output(truncated?text+"\n[output truncated at 1 MiB]":text,truncated,lines);
    }
}
