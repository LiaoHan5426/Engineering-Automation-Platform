package com.lh.eap.application.service;

import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** Local features command parses configuration without creating an agent/session/model request. */
@EnabledIfEnvironmentVariable(named="EAP_CODEX_CONFIG_CHECK",matches="true")
class CodexLocalConfigTest {
    @TempDir Path root;
    @Test void realCliLoadsRevisedConfigAndRejectsOldOverride()throws Exception{
        var binary=System.getenv("EAP_SMOKE_CODEX");
        var env=new LinkedHashMap<String,String>();
        for(var key:List.of("SystemRoot","WINDIR","PATH","TEMP","TMP"))if(System.getenv(key)!=null)env.put(key,System.getenv(key));
        env.put("CODEX_HOME",Files.createDirectory(root.resolve("isolated-home")).toString());
        try(var executor=new DefaultProcessExecutor(Duration.ofSeconds(10))){
            var version=executor.runIsolated("local-config",root,List.of(binary,"--version"),env);
            assertTrue(version.stdout().contains("0.163.0-alpha.11.2"));
            var old=executor.runIsolated("local-config",root,List.of(binary,"-c","model_providers.openai.request_max_retries=0","features","list"),env);
            assertFalse(old.success());assertTrue(old.stderr().contains("reserved built-in provider"));
            var args=new ArrayList<String>();args.add(binary);args.addAll(List.of("--model","gpt-6.1-sol","--sandbox","workspace-write"));
            args.addAll(CodexAdapter.configurationArguments());args.addAll(List.of("features","list"));
            var revised=executor.runIsolated("local-config",root,args,env);
            assertTrue(revised.success(),revised.stderr());
            var evidence=Path.of(System.getProperty("eap.config.evidence"));
            Files.createDirectories(evidence);
            Files.writeString(evidence.resolve("local-config-check.txt"),"version="+version.stdout()+"\noldExit="+old.exitCode()+"\noldError="+old.stderr()+"\nrevisedArgv="+args+"\nrevisedExit="+revised.exitCode()+"\nrevisedStdout="+revised.stdout()+"\nrevisedStderr="+revised.stderr());
        }
    }
}
