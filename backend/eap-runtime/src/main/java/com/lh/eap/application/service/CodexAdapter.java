package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.api.CliExecution.*;
import com.lh.eap.common.SensitiveData;
import java.nio.file.*;
import java.util.*;
import java.io.IOException;
import tools.jackson.databind.json.JsonMapper;

/** Explicitly constructed by trusted callers, never enabled merely by registering a CLI. */
public final class CodexAdapter implements AgentAdapter {
    private final ProcessExecutor executor;
    private final CliExecutionService cli;
    private final Path testRoot;
    private final String binary, git;
    private final List<String> prefix;
    private final Map<String,String> environment;
    public enum ModelSupport { CACHE_LISTED, CONFIRMED_SUPPORTED, CONFIRMED_UNSUPPORTED, CACHE_MISS, UNKNOWN }
    public record ModelEvidence(ModelSupport support,String source,boolean userAuthorizedTrial) {
        public ModelEvidence(ModelSupport support,String source){this(support,source,false);}
        public ModelEvidence { Objects.requireNonNull(support);Objects.requireNonNull(source); }
    }
    private final Map<String,ModelEvidence> models;
    private final java.util.concurrent.atomic.AtomicBoolean trialConsumed=new java.util.concurrent.atomic.AtomicBoolean();
    private final JsonMapper json=JsonMapper.builder().build();
    public static List<String> configurationArguments(){
        // Non-interactive: deny requests requiring additional approval; never bypass policy/sandbox.
        return List.of("-c","approval_policy='never'",
                "-c","sandbox_workspace_write.network_access=false",
                "-c","sandbox_workspace_write.exclude_tmpdir_env_var=true",
                "-c","sandbox_workspace_write.exclude_slash_tmp=true");
    }
    public RetryPolicy retryPolicy(){return new RetryPolicy(0,"NOT_CONTROLLED_BY_EAP");}
    public CodexAdapter(ProcessExecutor executor,Path testRoot,String binary,List<String> prefix,
                        String git,Map<String,String> environment){
        this(executor,testRoot,binary,prefix,git,environment,Map.of());
    }
    /** Evidence must be supplied by the trusted caller, never by the submitted task. */
    public CodexAdapter(ProcessExecutor executor,Path testRoot,String binary,List<String> prefix,
                        String git,Map<String,String> environment,Map<String,ModelEvidence> models){
        this.executor=executor;this.cli=new CliExecutionService(executor,new FileExecutionArtifactStore(testRoot.resolve(".eap-execution-artifacts")));this.testRoot=testRoot;
        this.binary=binary;this.prefix=List.copyOf(prefix);this.git=git;this.environment=Map.copyOf(environment);
        this.models=Map.copyOf(models);
    }
    public Optional<Snapshot> status(UUID id){return executor.status(id);}
    public Optional<Snapshot> cancel(UUID id){return executor.cancel(id);}
    private Result call(UUID id,Path cwd,String executable,List<String> args,Set<Integer> sensitive){
        var service=args.contains("exec")&&args.contains("--json")?cli:new CliExecutionService(executor);
        return service.execute(new Request(id,"agent.codex",cwd,args,environment,Approval.APPROVED),
                new Policy(testRoot,executable,args,environment.keySet(),sensitive,true,true));
    }
    private Result codex(Path cwd,String...args){
        var argv=new ArrayList<>(prefix);argv.addAll(List.of(args));
        return call(UUID.randomUUID(),cwd,binary,argv,Set.of());
    }
    private String clean(String value){
        var result=value;
        for(var secret:environment.values())if(!secret.isEmpty())result=result.replace(secret,"[REDACTED]");
        return SensitiveData.redact(result);
    }
    private String git(Path repo,String...args){
        var r=call(UUID.randomUUID(),repo,git,List.of(args),Set.of());
        if(r.status()!=Status.SUCCEEDED)throw new IllegalStateException("GIT_EVIDENCE_FAILED");
        return r.stdout();
    }
    private boolean valid(Path repo)throws IOException {
        var real=repo.toRealPath();var allowed=testRoot.toRealPath();
        return allowed.startsWith(Path.of(System.getProperty("java.io.tmpdir")).toRealPath())
                &&real.startsWith(allowed)&&!real.equals(allowed)&&Files.isDirectory(real.resolve(".git"))
                &&Files.isRegularFile(real.resolve(".eap-codex-test"));
    }
    @Override public Outcome execute(Task task){
        String version="",before="";Result execution=null;
        try{
            if(!task.approved())return failure(task,"APPROVAL_REQUIRED",version,null,before);
            if(task.model()==null||!task.model().matches("[A-Za-z0-9][A-Za-z0-9._-]{0,127}"))
                return failure(task,"INVALID_MODEL",version,null,before);
            var evidence=models.get(task.model());
            if(evidence==null||!evidence.userAuthorizedTrial()&&(evidence.support()==ModelSupport.UNKNOWN||evidence.support()==ModelSupport.CACHE_LISTED))
                return failure(task,"MODEL_SUPPORT_UNCONFIRMED",version,null,before);
            if(evidence.support()==ModelSupport.CACHE_MISS&&!evidence.userAuthorizedTrial())return failure(task,"MODEL_CACHE_MISS",version,null,before);
            if(evidence.support()==ModelSupport.CONFIRMED_UNSUPPORTED)return failure(task,"MODEL_UNSUPPORTED",version,null,before);
            if(task.instructions()==null||task.instructions().isBlank()||task.instructions().length()>4000)
                return failure(task,"INVALID_TASK",version,null,before);
            if(!valid(task.repository()))return failure(task,"REPOSITORY_DENIED",version,null,before);
            var repo=task.repository().toRealPath();
            var v=codex(repo,"--version");
            if(v.status()!=Status.SUCCEEDED)return failure(task,"CLI_MISSING_OR_UNSTARTABLE",version,v,before);
            version=v.stdout().trim();
            var help=codex(repo,"exec","--help");
            if(help.status()!=Status.SUCCEEDED)return failure(task,"UNSUPPORTED_PARAMETERS",version,help,before);
            for(var flag:List.of("--json","--sandbox","--cd","--ignore-user-config","--model","--ephemeral"))
                if(!help.stdout().contains(flag))return failure(task,"UNSUPPORTED_PARAMETERS",version,help,before);
            var auth=codex(repo,"login","status");
            if(auth.status()!=Status.SUCCEEDED||!(auth.stdout()+auth.stderr()).contains("Logged in"))return failure(task,"NOT_AUTHENTICATED",version,auth,before);
            before=git(repo,"status","--porcelain=v1","--untracked-files=all");
            if(evidence.userAuthorizedTrial()&&!trialConsumed.compareAndSet(false,true))return failure(task,"TRIAL_ALREADY_CONSUMED",version,null,before);
            var args=new ArrayList<>(prefix);
            args.addAll(List.of("exec","--model",task.model(),"--json","--sandbox","workspace-write","--ephemeral","--ignore-user-config"));
            args.addAll(configurationArguments());
            args.addAll(List.of("--cd",repo.toString(),
                    "Only work in this test repository. Do not push, merge, commit or access other directories. "+task.instructions()));
            execution=call(task.executionId(),repo,binary,args,Set.of(args.size()-1));
            var events=new ArrayList<AgentAdapter.Event>();String error=classify(execution);boolean completed=false;
            var received=execution.trace().stdoutLines();
            if(received.isEmpty())received=Arrays.stream(execution.stdout().split("\\R")).map(s->new ReceivedLine(0,null,s)).toList();
            for(var receivedLine:received){
                var line=receivedLine.text();
                if(line.isBlank())continue;
                try{
                    var node=json.readTree(line);var type=node.path("type").asText("");
                    if(type.isEmpty())throw new IllegalArgumentException();
                    if(type.equals("turn.completed"))completed=true;
                    if(type.equals("turn.failed")||type.equals("error"))
                        error=modelRejected(line)?"MODEL_SERVER_REJECTED":"PROVIDER_ERROR";
                    events.add(new AgentAdapter.Event(events.size()+1,type,clean(node.path("thread_id").asText("")),clean(line),receivedLine.receivedAt()));
                }catch(RuntimeException malformed){error="INVALID_OR_TRUNCATED_JSONL";break;}
            }
            if(error.isEmpty()&&!completed)error="INCOMPLETE_PROTOCOL";
            if(!execution.trace().toolError().isEmpty())error=execution.trace().toolError();
            if(error.isEmpty()&&execution.trace().truncated())error="INVALID_OR_TRUNCATED_JSONL";
            if(error.isEmpty()&&!execution.artifactError().isEmpty())error=execution.artifactError();
            if(execution.status()==Status.TIMED_OUT)error="TIMED_OUT";
            if(execution.status()==Status.CANCELLED)error="CANCELLED";
            return new Outcome(task.executionId(),version,task.model(),task.model(),clean(evidence.source()),retryPolicy(),error,execution,events,before,
                    git(repo,"status","--porcelain=v1","--untracked-files=all"),git(repo,"diff","--no-ext-diff","--stat"));
        }catch(IOException e){return failure(task,"REPOSITORY_DENIED",version,execution,before);}
        catch(RuntimeException e){return failure(task,"ADAPTER_OR_GIT_ERROR",version,execution,before);}
    }
    private String classify(Result r){
        if(r.status()==Status.CANCELLED)return "CANCELLED";
        if(r.status()==Status.TIMED_OUT)return "TIMED_OUT";
        var text=(r.stdout()+r.stderr()).toLowerCase(Locale.ROOT);
        if(CliExecutionService.toolPolicyDenied(text))return "TOOL_POLICY_DENIED";
        if(text.contains("error loading config"))return "CLI_CONFIG_ERROR";
        if(modelRejected(text))return "MODEL_SERVER_REJECTED";
        if(text.contains("unauthorized")||text.contains("not logged in"))return "AUTHENTICATION_FAILED";
        if(text.contains("connection")||text.contains("network"))return "NETWORK_ERROR";
        return r.status()==Status.SUCCEEDED?"":"NONZERO_OR_PROCESS_FAILURE";
    }
    private Outcome failure(Task task,String error,String version,Result r,String before){
        var model=task.model()==null?"":clean(task.model());
        model=model.substring(0,Math.min(128,model.length()));
        var evidence=models.get(task.model()==null?"":task.model());
        return new Outcome(task.executionId(),version,model,
                r!=null&&r.executionId().equals(task.executionId())?model:"",
                evidence==null?"none":clean(evidence.source()),retryPolicy(),error,r,List.of(),before,"","");
    }
    private static boolean modelRejected(String text){
        var value=text.toLowerCase(Locale.ROOT);
        return value.contains("model_not_found")||value.contains("unsupported_model")
                ||value.contains("model is not supported")||value.contains("model does not exist");
    }
}
