package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.core.DefaultProcessExecutor;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import tools.jackson.databind.json.JsonMapper;

/** Explicit opt-in, one-shot user-approved smoke. Never part of ordinary model-free tests. */
@EnabledIfEnvironmentVariable(named="EAP_REAL_CODEX_SMOKE",matches="approved-gpt-6.1-sol-once")
class CodexRealSmokeTest {
    @Test void singleApprovedCall()throws Exception{
        var evidence=Path.of(System.getProperty("eap.smoke.evidence")).toAbsolutePath();
        Files.createDirectories(evidence);
        Files.writeString(evidence.resolve("once.lock"),"single authorized attempt",StandardOpenOption.CREATE_NEW);
        var root=Files.createTempDirectory("eap-codex-smoke-");var repo=Files.createDirectory(root.resolve("repo"));
        Files.writeString(repo.resolve(".eap-codex-test"),"isolated smoke only");
        var git=System.getenv("EAP_SMOKE_GIT");var binary=System.getenv("EAP_SMOKE_CODEX");
        var init=new ProcessBuilder(git,"init",repo.toString()).start();
        if(!init.waitFor(5,java.util.concurrent.TimeUnit.SECONDS)||init.exitValue()!=0)throw new IllegalStateException("Git init failed");
        var env=new LinkedHashMap<String,String>();
        for(var key:List.of("SystemRoot","WINDIR","TEMP","TMP","PATH","USERPROFILE","APPDATA","LOCALAPPDATA"))if(System.getenv(key)!=null)env.put(key,System.getenv(key));
        env.put("CODEX_HOME",Path.of(System.getProperty("user.home"),".codex").toString());
        var id=UUID.randomUUID();
        try(var executor=new DefaultProcessExecutor(Duration.ofSeconds(Long.getLong("eap.smoke.timeoutSeconds",20L)))){
            var adapter=new CodexAdapter(executor,root,binary,List.of(),git,env,Map.of("gpt-6.1-sol",
                    new CodexAdapter.ModelEvidence(CodexAdapter.ModelSupport.CACHE_LISTED,"explicit user approval; non-authoritative cache",true)));
            var outcome=adapter.execute(new AgentAdapter.Task(id,repo,
                    "你正在一个独立测试 Git 仓库中执行任务。请在仓库根目录创建 hello.txt，内容严格为 Hello from EAP Codex exec probe（UTF-8，无换行）。优先使用官方提供的文件补丁工具完成写入。如果补丁工具返回权限拒绝，不要改用 PowerShell、Python 或其他工具绕过拒绝，不要重复尝试。如果可以从当前会话直接读取到有效沙箱或审批状态，可以简要报告；不能读取则不要猜测。不要修改其他文件（包括测试标记），不要执行 Git 提交或推送。不要使用网络工具、提权或系统初始化。","gpt-6.1-sol",true));
            var report=new LinkedHashMap<String,Object>();report.put("outcome",outcome);report.put("repository",repo.toString());
            report.put("snapshot",executor.status(id).orElse(null));report.put("activeCount",executor.activeCount());
            var hello=repo.resolve("hello.txt");
            report.put("helloExists",Files.isRegularFile(hello));
            report.put("helloExact",Files.isRegularFile(hello)&&Arrays.equals(Files.readAllBytes(hello),"Hello from EAP Codex exec probe".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            try(var files=Files.list(repo)){report.put("files",files.map(p->p.getFileName().toString()).sorted().toList());}
            for(var command:List.of(List.of("status","--porcelain=v1","--untracked-files=all"),List.of("remote","-v"),List.of("diff","--no-ext-diff"))){
                var args=new ArrayList<String>();args.add(git);args.addAll(command);
                var obs=executor.run("independent-inspection",repo,args);
                report.put(String.join(" ",command),obs.stdout());
            }
            report.put("helloContent",Files.isRegularFile(hello)?Files.readString(hello):"");
            Files.writeString(evidence.resolve("result.json"),JsonMapper.builder().build().writeValueAsString(report));
            System.out.println("Smoke outcome="+outcome.error()+" executionId="+id+" evidence="+evidence);
        }
    }
}
