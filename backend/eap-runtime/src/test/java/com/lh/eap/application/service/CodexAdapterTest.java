package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.time.Duration;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class CodexAdapterTest {
    private static final String PATCH_REJECTION="patch rejected: writing is blocked by read-only sandbox; rejected by user approval settings";
    @TempDir Path root;
    String java=Path.of(System.getProperty("java.home"),"bin","java.exe").toString();
    Path repo;
    @BeforeEach void init()throws Exception{
        repo=Files.createDirectory(root.resolve("repo"));
        var p=new ProcessBuilder("git","init",repo.toString()).start();assertEquals(0,p.waitFor());
        Files.writeString(repo.resolve(".eap-codex-test"),"temporary fake test");
    }
    CodexAdapter adapter(DefaultProcessExecutor e,String mode){return new CodexAdapter(e,root,java,
            List.of("-cp",System.getProperty("java.class.path"),Fake.class.getName(),mode),"git",Map.of("EAP_SECRET","secret-value"),evidence());}
    Map<String,CodexAdapter.ModelEvidence> evidence(){return Map.of("test-model",new CodexAdapter.ModelEvidence(CodexAdapter.ModelSupport.CONFIRMED_SUPPORTED,"fake-test-only"));}
    AgentAdapter.Task task(){return new AgentAdapter.Task(UUID.randomUUID(),repo,"create one tiny file","test-model",true);}
    @Test void parsesEventsAndCapturesGitWithoutVerifyingBusiness(){
        try(var e=new DefaultProcessExecutor()){
            var result=adapter(e,"ok").execute(task());assertEquals("",result.error());
            assertEquals("fake-session",result.events().getFirst().sessionId());
            assertTrue(result.gitAfter().contains("fake.txt"));assertFalse(result.toString().contains("secret-value"));
            assertEquals(CliExecution.Verification.UNVERIFIED,result.execution().verification());
            assertEquals("test-model",result.requestedModel());assertEquals("test-model",result.transmittedModel());
            assertEquals("fake-test-only",result.modelEvidence());
            assertEquals(0,result.retryPolicy().eapAutomaticRetries());
            assertEquals("NOT_CONTROLLED_BY_EAP",result.retryPolicy().codexInternalRetries());
            assertFalse(result.execution().commandSummary().stream().anyMatch(s->s.startsWith("model_providers.")));
            assertTrue(result.execution().commandSummary().containsAll(CodexAdapter.configurationArguments()));
            int index=result.execution().commandSummary().indexOf("--model");
            assertTrue(index>=0);assertEquals("test-model",result.execution().commandSummary().get(index+1));
            assertEquals(1,result.execution().commandSummary().stream().filter("--model"::equals).count());
        }
    }
    @Test void rejectsMissingVersionAuthAndRepository(){
        try(var e=new DefaultProcessExecutor()){
            assertEquals("UNSUPPORTED_VERSION",adapter(e,"version").execute(task()).error());
            assertEquals("UNSUPPORTED_PARAMETERS",adapter(e,"params").execute(task()).error());
            assertEquals("NOT_AUTHENTICATED",adapter(e,"auth").execute(task()).error());
            assertEquals("CLI_MISSING_OR_UNSTARTABLE",new CodexAdapter(e,root,"missing-eap.exe",List.of(),"git",Map.of(),evidence()).execute(task()).error());
            assertEquals("REPOSITORY_DENIED",adapter(e,"ok").execute(new AgentAdapter.Task(UUID.randomUUID(),root,"x","test-model",true)).error());
            assertEquals("APPROVAL_REQUIRED",adapter(e,"ok").execute(new AgentAdapter.Task(UUID.randomUUID(),repo,"x","test-model",false)).error());
        }
    }
    @Test void classifiesNonzeroNetworkAndMalformed(){
        try(var e=new DefaultProcessExecutor()){
            assertEquals("NONZERO_OR_PROCESS_FAILURE",adapter(e,"fail").execute(task()).error());
            assertEquals("NETWORK_ERROR",adapter(e,"network").execute(task()).error());
            assertEquals("INVALID_OR_TRUNCATED_JSONL",adapter(e,"badjson").execute(task()).error());
        }
    }
    @Test void cancellationAndConcurrentDelegationAreIsolated()throws Exception{
        try(var e=new DefaultProcessExecutor();var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var a=adapter(e,"sleep");var t=task();var f=pool.submit(()->a.execute(t));
            long until=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);
            while(a.status(t.executionId()).isEmpty()&&System.nanoTime()<until)Thread.sleep(10);
            assertTrue(a.status(t.executionId()).isPresent());a.cancel(t.executionId());
            var result=f.get(8,TimeUnit.SECONDS);assertEquals("CANCELLED",result.error());
            assertTrue(result.execution().trace().phases().containsKey("cancelled")||!result.execution().trace().phases().containsKey("started"));
        }
    }
    @Test void timesOutWithoutCallingAnyModel(){
        try(var e=new DefaultProcessExecutor(Duration.ofSeconds(2))){
            assertEquals("TIMED_OUT",adapter(e,"sleep").execute(task()).error());
        }
    }
    @Test void concurrentRequestsKeepExecutionIdsSeparate()throws Exception{
        try(var e=new DefaultProcessExecutor();var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var a=task();var b=task();var first=adapter(e,"ok");var second=adapter(e,"ok");
            var fa=pool.submit(()->first.execute(a));var fb=pool.submit(()->second.execute(b));
            var ra=fa.get(12,TimeUnit.SECONDS);var rb=fb.get(12,TimeUnit.SECONDS);
            assertEquals(a.executionId(),ra.execution().executionId());assertEquals(b.executionId(),rb.execution().executionId());
            assertEquals("",ra.error());assertEquals("",rb.error());
            assertEquals(3,ra.execution().artifacts().size());assertEquals(3,rb.execution().artifacts().size());
            assertTrue(Collections.disjoint(ra.execution().artifacts(),rb.execution().artifacts()));
            for(var artifact:ra.execution().artifacts())assertTrue(artifact.relativePath().startsWith(a.executionId().toString()+"/"));
            for(var artifact:rb.execution().artifacts())assertTrue(artifact.relativePath().startsWith(b.executionId().toString()+"/"));
        }
    }
    @Test void invalidModelCannotStartOrInjectArguments(){
        try(var e=new DefaultProcessExecutor()){
            for(var model:Arrays.asList(null,""," ","--help","test-model --sandbox danger-full-access","x;echo", "x\n--help","x".repeat(129))){
                var r=adapter(e,"ok").execute(new AgentAdapter.Task(UUID.randomUUID(),repo,"x",model,true));
                assertEquals("INVALID_MODEL",r.error());assertNull(r.execution());assertEquals("",r.transmittedModel());
            }
            assertTrue(e.snapshots().isEmpty());
        }
    }
    @Test void unsupportedAndUnknownEvidenceNeverFallback(){
        try(var e=new DefaultProcessExecutor()){
            for(var entry:Map.of(CodexAdapter.ModelSupport.UNKNOWN,"MODEL_SUPPORT_UNCONFIRMED",CodexAdapter.ModelSupport.CACHE_LISTED,"MODEL_SUPPORT_UNCONFIRMED",
                    CodexAdapter.ModelSupport.CACHE_MISS,"MODEL_CACHE_MISS",CodexAdapter.ModelSupport.CONFIRMED_UNSUPPORTED,"MODEL_UNSUPPORTED").entrySet()){
                var a=new CodexAdapter(e,root,java,List.of(),"git",Map.of(),Map.of("test-model",new CodexAdapter.ModelEvidence(entry.getKey(),"test")));
                var r=a.execute(task());assertEquals(entry.getValue(),r.error());assertNull(r.execution());assertEquals("",r.transmittedModel());
            }
            assertEquals("MODEL_SUPPORT_UNCONFIRMED",new CodexAdapter(e,root,java,List.of(),"git",Map.of()).execute(task()).error());
            assertTrue(e.snapshots().isEmpty());
        }
    }
    @Test void serverModelRejectionDoesNotRetryOrFallback(){
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"reject-model").execute(task());assertEquals("MODEL_SERVER_REJECTED",r.error());
            assertEquals("test-model",r.transmittedModel());assertEquals(1,e.snapshots().stream().filter(s->s.executionId().equals(r.executionId())).count());
        }
    }
    @Test void configurationArgumentsOnlyContainVerifiedNoninteractiveKeys(){
        assertEquals(List.of("-c","approval_policy='never'",
                "-c","sandbox_workspace_write.network_access=false",
                "-c","sandbox_workspace_write.exclude_tmpdir_env_var=true",
                "-c","sandbox_workspace_write.exclude_slash_tmp=true"),CodexAdapter.configurationArguments());
    }
    @Test void noninteractivePolicyDenialIsNotApprovalOrBusinessSuccess(){
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"policy-denied").execute(task());
            assertEquals("TOOL_POLICY_DENIED",r.error());
            assertEquals(CliExecution.Status.FAILED,r.execution().status());
            assertEquals(CliExecution.Approval.APPROVED,r.execution().approval());
            assertEquals(CliExecution.Verification.UNVERIFIED,r.execution().verification());
            assertFalse(Files.exists(repo.resolve("fake.txt")));
            assertTrue(r.execution().commandSummary().contains("approval_policy='never'"));
        }
    }
    @Test void authorizedUnknownModelGetsExactlyOneTrialButUnsupportedStillDenied(){
        try(var e=new DefaultProcessExecutor()){
            for(var support:List.of(CodexAdapter.ModelSupport.UNKNOWN,CodexAdapter.ModelSupport.CACHE_LISTED,CodexAdapter.ModelSupport.CACHE_MISS)){
                var a=new CodexAdapter(e,root,java,List.of("-cp",System.getProperty("java.class.path"),Fake.class.getName(),"ok"),"git",Map.of(),
                        Map.of("test-model",new CodexAdapter.ModelEvidence(support,"user-approved-fake-only",true)));
                assertEquals("",a.execute(task()).error());assertEquals("TRIAL_ALREADY_CONSUMED",a.execute(task()).error());
            }
            var blocked=new CodexAdapter(e,root,java,List.of(),"git",Map.of(),Map.of("test-model",
                    new CodexAdapter.ModelEvidence(CodexAdapter.ModelSupport.CONFIRMED_UNSUPPORTED,"denied",true)));
            assertEquals("MODEL_UNSUPPORTED",blocked.execute(task()).error());
        }
    }
    @Test void capturesReceiveTimesAndDelayedExitArtifacts()throws Exception{
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"delayed-exit").execute(task());assertEquals("",r.error());
            var trace=r.execution().trace();assertTrue(trace.phases().containsKey("cleanupFinished"));
            var completed=r.events().getLast();assertEquals("turn.completed",completed.type());
            assertNotNull(completed.receivedAt());
            assertTrue(Duration.between(completed.receivedAt(),trace.phases().get("exitObserved")).toMillis()>=150);
            assertEquals(3,r.execution().artifacts().size());
            var example=Files.createTempDirectory(Path.of("target"),"p1c-evidence-example-");
            for(var a:r.execution().artifacts()){
                var path=root.resolve(".eap-execution-artifacts").resolve(a.relativePath());
                var bytes=Files.readAllBytes(path);assertEquals(bytes.length,a.sizeBytes());
                assertEquals(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),a.sha256());
                assertEquals(r.executionId(),a.executionId());assertFalse(Files.readString(path).contains("secret-value"));
                var retained=example.resolve(a.relativePath());Files.createDirectories(retained.getParent());Files.copy(path,retained);
            }
            Files.writeString(example.resolve("references.json"),tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsString(r.execution().artifacts()));
            System.out.println("P1C_ARTIFACT_EXAMPLE="+example.toAbsolutePath());
        }
    }
    @Test void fullJsonlBeyondSummaryIsParsedAndArchived(){
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"large").execute(task());assertEquals("",r.error());
            assertEquals(8000,r.execution().stdout().length());assertTrue(r.events().size()>200);
            assertEquals("turn.completed",r.events().getLast().type());
            assertTrue(r.execution().artifacts().stream().anyMatch(a->a.kind().equals("codex-jsonl")&&a.sizeBytes()>8000));
        }
    }
    @Test void completedTurnDoesNotOverrideTimeoutOrPolicyDenial(){
        try(var e=new DefaultProcessExecutor(Duration.ofSeconds(2))){
            var r=adapter(e,"policy-stall").execute(task());assertEquals("TIMED_OUT",r.error());
            assertEquals("TOOL_POLICY_DENIED",r.execution().trace().toolError());
            assertTrue(r.execution().trace().phases().containsKey("timedOut"));
            assertTrue(r.events().stream().anyMatch(event->event.type().equals("turn.completed")));
            assertTrue(e.status(r.executionId()).orElseThrow().cleanupComplete());
        }
    }
    @Test void policyDenialBeyondStderrSummaryRemainsADelegationFailure(){
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"policy-completed").execute(task());
            assertEquals(CliExecution.Status.SUCCEEDED,r.execution().status());
            assertEquals("TOOL_POLICY_DENIED",r.error());
            assertEquals("TOOL_POLICY_DENIED",r.execution().trace().toolError());
            assertFalse(r.execution().stderr().contains("blocked by policy"));
        }
    }
    @Test void artifactFailureIsSeparateFromSuccessfulProcess()throws Exception{
        Files.writeString(root.resolve(".eap-execution-artifacts"),"not a directory");
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"ok").execute(task());
            assertEquals(CliExecution.Status.SUCCEEDED,r.execution().status());
            assertEquals("ARTIFACT_SAVE_FAILED",r.execution().artifactError());assertEquals("ARTIFACT_SAVE_FAILED",r.error());
            assertEquals(CliExecution.Verification.UNVERIFIED,r.execution().verification());
        }
    }
    @Test void boundedCaptureNeverClaimsCompleteEvidenceAfterOverflow(){
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"overflow").execute(task());
            assertTrue(r.execution().trace().truncated());
            assertEquals("INVALID_OR_TRUNCATED_JSONL",r.error());
            assertEquals(CliExecution.Verification.UNVERIFIED,r.execution().verification());
        }
    }
    @Test void realPatchRejectionWithZeroExitIsVisibleWithoutChangingProcessState(){
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"read-only-patch").execute(task());
            assertEquals("TOOL_POLICY_DENIED",r.error());
            assertEquals("TOOL_POLICY_DENIED",r.execution().trace().toolError());
            assertEquals(CliExecution.Status.SUCCEEDED,r.execution().status());assertEquals(0,r.execution().exitCode());
            assertEquals(CliExecution.Approval.APPROVED,r.execution().approval());
            assertEquals(CliExecution.Verification.UNVERIFIED,r.execution().verification());
            assertTrue(r.execution().trace().stderr().contains(PATCH_REJECTION));
            assertTrue(r.events().stream().anyMatch(event->event.type().equals("turn.completed")));
            assertFalse(Files.exists(repo.resolve("hello.txt")));assertFalse(Files.exists(repo.resolve("fake.txt")));
            assertFalse(r.diff().contains("hello.txt"));assertFalse(r.gitAfter().contains("hello.txt"));
            assertEquals("TOOL_POLICY_DENIED",r.error());
            assertEquals(3,r.execution().artifacts().size());assertEquals("",r.execution().artifactError());
            assertTrue(e.status(r.executionId()).orElseThrow().cleanupComplete());
        }
    }
    @Test void realPatchRejectionDoesNotOverrideTimeout(){
        try(var e=new DefaultProcessExecutor(Duration.ofSeconds(2))){
            var r=adapter(e,"read-only-patch-stall").execute(task());
            assertEquals("TIMED_OUT",r.error());assertEquals(CliExecution.Status.TIMED_OUT,r.execution().status());
            assertEquals("TOOL_POLICY_DENIED",r.execution().trace().toolError());
        }
    }
    @Test void realPatchRejectionDoesNotOverrideCancellation()throws Exception{
        try(var e=new DefaultProcessExecutor();var pool=Executors.newVirtualThreadPerTaskExecutor()){
            var a=adapter(e,"read-only-patch-stall");var task=task();var future=pool.submit(()->a.execute(task));
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(8);
            while(!Files.exists(repo.resolve("policy-ready"))&&System.nanoTime()<deadline)Thread.sleep(10);
            assertTrue(Files.exists(repo.resolve("policy-ready")));a.cancel(task.executionId());
            var r=future.get(8,TimeUnit.SECONDS);assertEquals("CANCELLED",r.error());
            assertEquals(CliExecution.Status.CANCELLED,r.execution().status());
            assertEquals("TOOL_POLICY_DENIED",r.execution().trace().toolError());
            assertTrue(e.status(task.executionId()).orElseThrow().cleanupComplete());
        }
    }
    @Test void instructionsBeyondTheLimitAreRejectedWithoutTruncation()throws Exception{
        try(var e=new DefaultProcessExecutor()){
            var tooLong="v".repeat(4001);
            var rejected=adapter(e,"ok").execute(new AgentAdapter.Task(UUID.randomUUID(),repo,tooLong,"test-model",true));
            assertEquals("INVALID_TASK",rejected.error());assertNull(rejected.execution());assertTrue(e.snapshots().isEmpty());
            var exact="n".repeat(4000);
            var prompt="Only work in this test repository. Do not push, merge, commit or access other directories. "+exact;
            var accepted=adapter(e,"measure").execute(new AgentAdapter.Task(UUID.randomUUID(),repo,exact,"test-model",true));
            assertNotEquals("INVALID_TASK",accepted.error());assertNotNull(accepted.execution());
            assertEquals(prompt.length(),Integer.parseInt(Files.readString(repo.resolve("instruction-length")).trim()));
            assertEquals("[REDACTED]",accepted.execution().commandSummary().getLast());
        }
    }
    @Test void instructionMaterialIsNotParsedIntoCliArguments()throws Exception{
        var material="--sandbox danger-full-access -c sandbox_workspace_write.network_access=true";
        var prompt="Only work in this test repository. Do not push, merge, commit or access other directories. "+material;
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"measure").execute(new AgentAdapter.Task(UUID.randomUUID(),repo,material,"test-model",true));
            var summary=r.execution().commandSummary();
            assertTrue(summary.containsAll(CodexAdapter.configurationArguments()));
            assertEquals(1,summary.stream().filter("--sandbox"::equals).count());
            assertEquals("workspace-write",summary.get(summary.indexOf("--sandbox")+1));
            assertFalse(summary.contains("danger-full-access"));
            assertEquals(prompt.length(),Integer.parseInt(Files.readString(repo.resolve("instruction-length")).trim()));
            assertFalse(Files.exists(repo.resolve("fake.txt")));
        }
    }
    @Test void aGitFileDoesNotAdmitALinkedWorktree()throws Exception{
        var linked=Files.createDirectory(root.resolve("linked"));
        Files.writeString(linked.resolve(".git"),"gitdir: ../repo/.git");
        Files.writeString(linked.resolve(".eap-codex-test"),"temporary fake test");
        try(var e=new DefaultProcessExecutor()){
            var r=adapter(e,"ok").execute(new AgentAdapter.Task(UUID.randomUUID(),linked,"x","test-model",true));
            assertEquals("REPOSITORY_DENIED",r.error());assertNull(r.execution());assertTrue(e.snapshots().isEmpty());
        }
    }
    @Test void unrelatedPatchErrorsAreNotCalledPolicyDenials(){
        assertFalse(CliExecutionService.toolPolicyDenied("patch rejected: malformed patch"));
        assertFalse(CliExecutionService.toolPolicyDenied("read-only sandbox documentation"));
    }
    private static List<String> expectedInvocation(Path cwd){
        return List.of("exec","--model","test-model","--json","--sandbox","workspace-write",
                "--ephemeral","--ignore-user-config","-c","approval_policy='never'",
                "-c","sandbox_workspace_write.network_access=false",
                "-c","sandbox_workspace_write.exclude_tmpdir_env_var=true",
                "-c","sandbox_workspace_write.exclude_slash_tmp=true","--cd",cwd.toString(),
                "Only work in this test repository. Do not push, merge, commit or access other directories. create one tiny file");
    }
    @Test void fakeRejectsExtraConflictingOrMissingConfiguration()throws Exception{
        var variants=new ArrayList<List<String>>();
        var extra=new ArrayList<>(expectedInvocation(repo.toRealPath()));
        extra.addAll(List.of("-c","sandbox_mode='read-only'"));variants.add(extra);
        var network=new ArrayList<>(expectedInvocation(repo.toRealPath()));
        network.set(network.indexOf("sandbox_workspace_write.network_access=false"),"sandbox_workspace_write.network_access=true");variants.add(network);
        var missing=new ArrayList<>(expectedInvocation(repo.toRealPath()));missing.remove("--ignore-user-config");variants.add(missing);
        var duplicate=new ArrayList<>(expectedInvocation(repo.toRealPath()));duplicate.addAll(List.of("--sandbox","read-only"));variants.add(duplicate);
        try(var e=new DefaultProcessExecutor()){
            for(var flags:variants){
                var command=new ArrayList<>(List.of(java,"-cp",System.getProperty("java.class.path"),Fake.class.getName(),"ok"));
                command.addAll(flags);
                var result=e.runIsolated("fake-argv-contract",repo,command,Map.of());
                assertEquals(10,result.exitCode());assertFalse(Files.exists(repo.resolve("fake.txt")));
            }
        }
    }
    public static class Fake{
        public static void main(String[]args)throws Exception{
            String mode=args[0];var flags=List.of(args);
            if(flags.contains("--version")){System.out.print(mode.equals("version")?"unknown":"codex-cli 0.163.0-alpha.11.2");return;}
            if(flags.contains("--help")){System.out.print(mode.equals("params")?"":"--json --sandbox --cd --ignore-user-config --model");return;}
            if(flags.contains("login")){System.out.print(mode.equals("auth")?"Not logged in":"Logged in using fake");if(mode.equals("auth"))System.exit(1);return;}
            if(mode.equals("measure")){
                var execArgs=flags.subList(1,flags.size());
                var fixed=expectedInvocation(Path.of(".").toRealPath());
                if(!execArgs.subList(0,execArgs.size()-1).equals(fixed.subList(0,fixed.size()-1)))System.exit(10);
                Files.writeString(Path.of("instruction-length"),Integer.toString(execArgs.getLast().length()));
                return;
            }
            if(!flags.subList(1,flags.size()).equals(expectedInvocation(Path.of(".").toRealPath())))System.exit(10);
            if(mode.equals("policy-denied")){System.err.print("Rejected: blocked by policy");System.exit(1);}
            if(mode.startsWith("read-only-patch")){
                System.err.println(PATCH_REJECTION);System.err.flush();
                System.out.println("{\"type\":\"turn.completed\"}");System.out.flush();
                if(mode.endsWith("stall")){Files.writeString(Path.of("policy-ready"),"ready");Thread.sleep(15000);}
                return;
            }
            if(mode.equals("policy-completed")){
                System.err.println("x".repeat(9000)+"Rejected: blocked by policy");
                System.out.println("{\"type\":\"turn.completed\"}");return;
            }
            if(mode.equals("policy-stall")){
                System.err.println("Rejected: blocked by policy token=secret-value");
                System.out.println("{\"type\":\"turn.completed\"}");Thread.sleep(15000);return;
            }
            if(mode.equals("reject-model")){System.err.print("model_not_found");System.exit(1);}
            if(mode.equals("sleep")){Thread.sleep(15000);return;}
            if(mode.equals("network")){System.err.print("network connection failed");System.exit(1);}
            if(mode.equals("fail"))System.exit(2);
            if(mode.equals("badjson")){System.out.print("invalid-json");return;}
            Files.writeString(Path.of("fake.txt"),"candidate");
            if(mode.equals("large"))for(int i=0;i<300;i++)System.out.println("{\"type\":\"item.completed\",\"text\":\""+"x".repeat(80)+"\"}");
            if(mode.equals("overflow"))for(int i=0;i<12000;i++)System.out.println("{\"type\":\"item.completed\",\"text\":\""+"x".repeat(80)+"\"}");
            System.out.println("{\"type\":\"thread.started\",\"thread_id\":\"fake-session\"}");
            System.out.println("{\"type\":\"item.completed\",\"text\":\"secret-value\"}");
            System.out.println("{\"type\":\"turn.completed\"}");
            if(mode.equals("delayed-exit")){System.out.flush();Thread.sleep(400);}
        }
    }
}
