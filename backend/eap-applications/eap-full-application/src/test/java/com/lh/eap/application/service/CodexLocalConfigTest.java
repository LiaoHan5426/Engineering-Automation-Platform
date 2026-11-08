package com.lh.eap.application.service;

import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

/** Local features command parses configuration without creating an agent, session, or model request. */
@EnabledIfEnvironmentVariable(named="EAP_CODEX_CONFIG_CHECK",matches="true")
class CodexLocalConfigTest {
    @TempDir Path root;
    @Test void realCliVersionIsRecordedAndCurrentConfigParses()throws Exception{
        var binary=System.getenv("EAP_SMOKE_CODEX");
        if(binary==null||binary.isBlank())fail("EAP_SMOKE_CODEX 必须显式提供");
        var env=new LinkedHashMap<String,String>();
        for(var key:List.of("SystemRoot","WINDIR","PATH","TEMP","TMP"))if(System.getenv(key)!=null)env.put(key,System.getenv(key));
        env.put("CODEX_HOME",Files.createDirectory(root.resolve("isolated-home")).toString());
        try(var executor=new DefaultProcessExecutor(Duration.ofSeconds(10))){
            var version=executor.runIsolated("local-config",root,List.of(binary,"--version"),env);
            assertTrue(version.success(),version.stderr());
            assertFalse(version.stdout().isBlank());
            var args=new ArrayList<String>();args.add(binary);args.addAll(List.of("--model","gpt-6.1-sol","--sandbox","workspace-write"));
            args.addAll(CodexAdapter.configurationArguments());args.addAll(List.of("features","list"));
            var parsed=executor.runIsolated("local-config",root,args,env);
            assertTrue(parsed.success(),parsed.stderr());
            Files.writeString(root.resolve("local-config-check.txt"),"version="+version.stdout().trim()+"\nparseExit="+parsed.exitCode()+"\n");
        }
    }
}
