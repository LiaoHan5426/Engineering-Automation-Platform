package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.api.CliExecution.*;
import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class CliExecutionServiceTest {
    @TempDir Path root;
    private Policy policy(String binary,List<String> args){return new Policy(root,binary,args,Set.of("EAP_SECRET"),Set.of(0),true,false);}
    private Request request(Path cwd,List<String> args,Map<String,String> env,Approval approval){return new Request(UUID.randomUUID(),"test",cwd,args,env,approval);}
    @Test void rejectsBeforeStartingProcesses() {
        ProcessExecutor never=(c,d,a)->{throw new AssertionError("Must not execute");};
        var service=new CliExecutionService(never); var p=policy("unused",List.of("fixed"));
        assertEquals("DIRECTORY_DENIED",service.execute(request(root.getParent(),List.of("fixed"),Map.of(),Approval.NOT_REQUIRED),p).error());
        assertEquals("ARGUMENT_TEMPLATE_MISMATCH",service.execute(request(root,List.of("other"),Map.of(),Approval.NOT_REQUIRED),p).error());
        assertEquals("ENVIRONMENT_DENIED",service.execute(request(root,List.of("fixed"),Map.of("HOME","leak"),Approval.NOT_REQUIRED),p).error());
        var denied=service.execute(request(root,List.of("fixed"),Map.of(),Approval.PENDING),p);
        assertEquals(Status.REJECTED,denied.status()); assertEquals(Approval.PENDING,denied.approval());
        assertEquals(Verification.UNVERIFIED,denied.verification()); assertNull(denied.exitCode());
    }
    @Test void redactsExplicitSecretsAndDoesNotExposeRawMetadata(){
        var executor=new ProcessExecutor(){
            public Observation run(String c,Path d,List<String>a){throw new AssertionError();}
            public Observation runIsolated(String c,Path d,List<String>a,Map<String,String>e){
                return new Observation(c,true,0,"bare-value password=hidden", "arg-value",Map.of("command",a));
            }
        };
        var result=new CliExecutionService(executor).execute(request(root,List.of("arg-value"),Map.of("EAP_SECRET","bare-value"),Approval.APPROVED),policy("test",List.of("arg-value")));
        assertEquals(Status.SUCCEEDED,result.status()); assertEquals(Verification.UNVERIFIED,result.verification());
        assertFalse(result.toString().contains("bare-value"));assertFalse(result.toString().contains("arg-value"));assertFalse(result.toString().contains("hidden"));
        assertEquals(List.of(1L,2L,3L),result.events().stream().map(Event::sequence).toList());
        assertTrue(result.events().stream().allMatch(e->e.executionId().equals(result.executionId())));
    }
    @Test void realNativeProcessUsesExplicitEnvironmentAndExitCode() {
        var binary=Path.of(System.getProperty("java.home"),"bin",System.getProperty("os.name").startsWith("Windows")?"java.exe":"java").toString();
        var service=new CliExecutionService(new DefaultProcessExecutor());
        var result=service.execute(request(root,List.of("--version"),Map.of(),Approval.NOT_REQUIRED),policy(binary,List.of("--version")));
        assertEquals(Status.SUCCEEDED,result.status());assertEquals(0,result.exitCode());assertEquals(Verification.UNVERIFIED,result.verification());
        var failed=service.execute(request(root,List.of("--invalid-eap-option"),Map.of(),Approval.NOT_REQUIRED),policy(binary,List.of("--invalid-eap-option")));
        assertEquals(Status.FAILED,failed.status());assertNotEquals(0,failed.exitCode());
    }
    @Test void retentionHasNoDeletionSideEffects(){
        assertEquals(30,Retention.defaults().metadata().toDays());assertEquals(7,Retention.defaults().artifacts().toDays());
        assertThrows(IllegalArgumentException.class,()->new Retention(java.time.Duration.ZERO,java.time.Duration.ofDays(7),java.time.Duration.ofDays(7)));
    }
    @Test void windowsJunctionCannotEscapeAuthorizedRoot() throws Exception {
        var allowed=Files.createDirectory(root.resolve("allowed"));
        var outside=Files.createDirectory(root.resolve("outside"));
        var junction=allowed.resolve("escape");
        var command=new ProcessBuilder("cmd.exe","/d","/c","mklink","/J",junction.toString(),outside.toString()).start();
        assertTrue(command.waitFor(5,java.util.concurrent.TimeUnit.SECONDS));assertEquals(0,command.exitValue());
        try {
            var service=new CliExecutionService((c,d,a)->{throw new AssertionError("Must reject junction");});
            var p=new Policy(allowed,"unused",List.of(),Set.of(),Set.of(),true,false);
            assertEquals("DIRECTORY_DENIED",service.execute(request(junction,List.of(),Map.of(),Approval.NOT_REQUIRED),p).error());
        } finally { Files.delete(junction); }
    }
    @Test void nativeEnvironmentIsNotInheritedAndWorkingDirectoryIsReal() throws Exception {
        var source=root.resolve("Probe.java");
        Files.writeString(source,"class Probe { public static void main(String[] a) { System.out.println(System.getenv().keySet()); System.out.println(System.getProperty(\"user.dir\")); } }");
        var binary=Path.of(System.getProperty("java.home"),"bin",System.getProperty("os.name").startsWith("Windows")?"java.exe":"java").toString();
        var executor=new DefaultProcessExecutor(java.time.Duration.ofSeconds(15));
        var observation=executor.runIsolated("probe",root,List.of(binary,source.toString()),Map.of("EAP_ALLOWED","yes"));
        assertTrue(observation.success(),observation.stderr());
        assertTrue(observation.stdout().contains("EAP_ALLOWED"));
        assertFalse(observation.stdout().contains("PATH"));
        assertTrue(observation.stdout().contains(root.toString()));
    }
}
