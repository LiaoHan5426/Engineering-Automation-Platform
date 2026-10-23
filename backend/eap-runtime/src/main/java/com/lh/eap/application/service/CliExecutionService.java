package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.api.CliExecution.*;
import com.lh.eap.common.SensitiveData;
import java.time.Instant;
import java.util.*;
import java.io.IOException;

/** Policy boundary over the existing process executor, not a second capability registry. */
public final class CliExecutionService {
    private final ProcessExecutor executor;
    private final ExecutionArtifactStore artifactStore;
    public CliExecutionService(ProcessExecutor executor) { this(executor,null); }
    public CliExecutionService(ProcessExecutor executor,ExecutionArtifactStore artifactStore) { this.executor = executor;this.artifactStore=artifactStore; }

    public Result execute(Request request, Policy policy) {
        var started=Instant.now(); var clock=System.nanoTime();
        var events=new ArrayList<Event>();
        events.add(new Event(request.executionId(),1,started,Status.CREATED));
        String rejection=validate(request,policy);
        var command=new ArrayList<String>(); command.add(policy.executable()); command.addAll(request.arguments());
        var secrets=new ArrayList<>(request.environment().values());
        for(var index:policy.sensitiveArguments()) if(index>=0&&index<request.arguments().size()) secrets.add(request.arguments().get(index));
        for(int i=0;i<request.arguments().size()-1;i++) {
            if(request.arguments().get(i).matches("(?i)--?(password|passwd|token|secret|api[-_]?key)")) secrets.add(request.arguments().get(i+1));
        }
        var summary=new ArrayList<String>(); summary.add(safe(policy.executable(),secrets));
        for(int i=0;i<request.arguments().size();i++) summary.add(policy.sensitiveArguments().contains(i)?"[REDACTED]":safe(request.arguments().get(i),secrets));
        Observation observation=null; Status state; String error="";
        if(rejection!=null){state=Status.REJECTED;error=rejection;}
        else {
            events.add(new Event(request.executionId(),2,Instant.now(),Status.RUNNING));
            try {
                observation=executor.runManaged(request.executionId(),request.capability(),request.directory().toRealPath(),command,request.environment());
                state=executor.status(request.executionId()).map(Snapshot::status)
                        .orElse(observation.success()?Status.SUCCEEDED:Status.FAILED);
                if(!observation.success()) error="PROCESS_FAILED";
            } catch(IOException|RuntimeException failure){state=Status.FAILED;error="EXECUTOR_FAILED";}
        }
        events.add(new Event(request.executionId(),events.size()+1,Instant.now(),state));
        var trace=Trace.empty();
        var artifacts=new ArrayList<Artifact>();String artifactError="";
        if(observation!=null&&observation.metadata().get("trace") instanceof Trace raw){
            var lines=raw.stdoutLines().stream().map(l->new ReceivedLine(l.sequence(),l.receivedAt(),redact(l.text(),secrets))).toList();
            var log=redact(raw.stderr(),secrets);
            boolean denied=toolPolicyDenied(log)||lines.stream().anyMatch(l->toolPolicyDenied(l.text()));
            trace=new Trace(raw.phases(),lines,log,raw.truncated(),denied?"TOOL_POLICY_DENIED":"");
            if(artifactStore!=null){
                try{
                    var json=tools.jackson.databind.json.JsonMapper.builder().build();
                    var jsonl=new StringBuilder();
                    for(var line:lines)jsonl.append(json.writeValueAsString(line)).append('\n');
                    artifacts.add(artifactStore.save(request.executionId(),"codex-jsonl",jsonl.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                    artifacts.add(artifactStore.save(request.executionId(),"stderr",log.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                    artifacts.add(artifactStore.save(request.executionId(),"process-trace",json.writeValueAsString(trace).getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                }catch(IOException|RuntimeException failure){artifactError="ARTIFACT_SAVE_FAILED";}
            }
        }else if(observation!=null&&artifactStore!=null){artifactError="EXECUTION_TRACE_UNAVAILABLE";}
        return new Result(request.executionId(),state,request.approval(),Verification.UNVERIFIED,started,
                (System.nanoTime()-clock)/1_000_000,observation==null?null:observation.exitCode(),error,
                summary,request.environment().keySet(),observation==null?"":safe(observation.stdout(),secrets),
                observation==null?"":safe(observation.stderr(),secrets),events,artifacts,trace,artifactError);
    }
    private static String validate(Request r,Policy p){
        if(!p.executionAllowed())return "EXECUTION_DENIED";
        if(r.approval()==Approval.DENIED||r.approval()==Approval.PENDING
                ||p.approvalRequired()&&r.approval()!=Approval.APPROVED)return "APPROVAL_REQUIRED";
        if(!r.arguments().equals(p.argumentTemplate()))return "ARGUMENT_TEMPLATE_MISMATCH";
        if(!p.allowedEnvironment().containsAll(r.environment().keySet()))return "ENVIRONMENT_DENIED";
        try {
            if(!java.nio.file.Files.isDirectory(r.directory())||!r.directory().toRealPath().startsWith(p.authorizedRoot().toRealPath()))return "DIRECTORY_DENIED";
        } catch(IOException e){return "DIRECTORY_DENIED";}
        return null;
    }
    private static String safe(String text,List<String> secrets){
        var value=redact(text,secrets);
        return value.substring(0,Math.min(8000,value.length()));
    }
    /** Known CLI rejection diagnostics, not a general inference from a model's success claim. */
    static boolean toolPolicyDenied(String text){
        var value=text.toLowerCase(Locale.ROOT);
        return value.contains("blocked by policy")
                ||value.contains("patch rejected")&&(value.contains("writing is blocked by read-only sandbox")
                ||value.contains("rejected by user approval settings"));
    }
    private static String redact(String text,List<String> secrets){
        var value=text==null?"":text;
        for(var secret:secrets.stream().filter(s->!s.isEmpty()).sorted(Comparator.comparingInt(String::length).reversed()).toList()) value=value.replace(secret,"[REDACTED]");
        value=SensitiveData.redact(value);
        value=value.replaceAll("(?i)Bearer\\s+[A-Za-z0-9._~+/-]+=*","Bearer [REDACTED]")
                .replaceAll("\\bsk-[A-Za-z0-9_-]{16,}","[REDACTED]");
        return value;
    }
}
