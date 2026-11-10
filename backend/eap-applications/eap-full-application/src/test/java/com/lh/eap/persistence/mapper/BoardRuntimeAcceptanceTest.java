package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.BoardRuntimeService;
import com.lh.eap.local.LocalProcessIdentityInspector;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;

/** Opt-in local DB/socket/browser acceptance; only UUID-owned schema and repository are mutated. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_BOARD_RUNTIME",matches="true")
class BoardRuntimeAcceptanceTest {
    static final List<String> TABLES=List.of("board_task","board_task_run","mission_execution","mission","handoff","code_generation","code_proposal");
    Path session; Process host,browser; String base;
    final HttpClient http=HttpClient.newHttpClient();
    @Test void scopedReadSnapshotAndDisabledUiLeaveTheRealCoreRunIndependent() throws Exception {
        assertEquals("true",System.getenv("EAP_RUN_BOARD_PERSISTENCE"));
        assertNotNull(System.getenv("EAP_PLAYWRIGHT_MODULE")); assertNotNull(System.getenv("EAP_CHROMIUM"));
        Path repo=Path.of("").toAbsolutePath(); while(!Files.isDirectory(repo.resolve("frontend")))repo=repo.getParent();
        session=repo.resolve("backend/target/board-runtime-"+UUID.randomUUID());Files.createDirectories(session.resolve("workspace"));
        String schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
        var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var original=digests(admin,"eap");
        admin.execute("CREATE SCHEMA "+schema);
        try {
            for(var table:TABLES)admin.execute("CREATE TABLE "+schema+"."+table+" (LIKE eap."+table+" INCLUDING ALL)");
            admin.execute("CREATE TABLE "+schema+".capability_setting (capability text PRIMARY KEY, enabled boolean NOT NULL, notes text, updated_at timestamptz)");
            var jdbc=new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
            verifyCountsAndScope(jdbc);
            var init=new ProcessBuilder("git","init","--quiet").directory(session.resolve("workspace").toFile()).start();
            assertTrue(init.waitFor(5,TimeUnit.SECONDS));assertEquals(0,init.exitValue());
            for(int i=0;i<2000;i++)Files.writeString(session.resolve("workspace/file-"+i+"-"+"x".repeat(80)+".txt"),"owned core-run fixture\n");
            host=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java").toString(),
                    "-Dspring.devtools.restart.enabled=false","-Dstdout.encoding=UTF-8","-Dstderr.encoding=UTF-8","-cp",
                    System.getProperty("surefire.test.class.path",System.getProperty("java.class.path")),BoardRuntimeFixture.class.getName(),session.toString(),schema)
                    .redirectErrorStream(true).redirectOutput(session.resolve("host.log").toFile()).start();
            await("host.json");var info=read("host.json");assertEquals(host.pid(),((Number)info.get("pid")).longValue());
            base="http://127.0.0.1:"+info.get("port");
            request("GET","/api/board/runtime?projectId=",null,400);
            request("GET","/api/board/runtime?projectId="+"x".repeat(121),null,400);
            request("POST","/api/board/runtime?projectId=local-eap",Map.of(),405);
            var task=request("POST","/api/board/tasks",Map.of("projectId","local-eap","title","Core run survives board UI disable",
                    "column","ready","goal","Inspect owned files","acceptanceCriteria","Actual Git evidence remains readable","requestId",UUID.randomUUID()),200);
            var run=request("POST","/api/board/tasks/"+task.get("id")+"/runs",Map.of("projectId","local-eap","revision",task.get("revision"),
                    "requestId",UUID.randomUUID(),"workspacePath",session.resolve("workspace").toRealPath().toString()),200);
            var execution=(Map<?,?>)run.get("execution");String id=(String)execution.get("id");
            await("running.json");var before=jdbc.queryForMap("SELECT status,cancel_requested FROM eap.mission_execution WHERE id=?",UUID.fromString(id));
            assertEquals("RUNNING",before.get("status"));assertEquals(false,before.get("cancel_requested"));
            write("browser-input.json",Map.of("base",base,"session",session.toString(),"frontend",repo.resolve("frontend").toString(),
                    "taskId",task.get("id"),"executionId",id));
            browser=new ProcessBuilder("node",repo.resolve("frontend/apps/web/__tests__/browser/board-runtime-live.mjs").toString(),"--session",session.toString())
                    .directory(repo.resolve("frontend").toFile()).redirectErrorStream(true).redirectOutput(session.resolve("browser.log").toFile()).start();
            await("release-worker.request");
            assertEquals(before,jdbc.queryForMap("SELECT status,cancel_requested FROM eap.mission_execution WHERE id=?",UUID.fromString(id)));
            Files.writeString(session.resolve("release.request"),"release actual Git");
            assertTrue(browser.waitFor(60,TimeUnit.SECONDS));assertEquals(0,browser.exitValue(),()->text("browser.log"));browser=null;
            var saved=jdbc.queryForMap("SELECT status,exit_code,cancel_requested,stdout,exit_evidence FROM eap.mission_execution WHERE id=?",UUID.fromString(id));
            assertEquals("SUCCEEDED",saved.get("status"));assertEquals(0,saved.get("exit_code"));assertEquals(false,saved.get("cancel_requested"));
            assertTrue(String.valueOf(saved.get("stdout")).contains("file-0-"));assertNotNull(saved.get("exit_evidence"));
            assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM eap.board_task_run WHERE task_id=?",Integer.class,UUID.fromString((String)task.get("id"))));
            assertTrue(processExited(), "Captured Git identity must have exited");
            var core=new BoardRuntimeService(jdbc).inspect("local-eap");assertEquals(1,core.taskCount());assertEquals(1,core.runCount());assertEquals(0,core.activeRunCount());
            write("result.json",Map.of("passed",true,"schema",schema,"executionId",id,"core",core,"browser",read("browser-result.json"),
                    "readScope",read("scope-result.json"),"actualGitSucceededWhileUiDisabled",true));
        } finally {
            Files.writeString(session.resolve("release.request"),"cleanup");
            if(browser!=null&&browser.isAlive()){browser.destroy();if(!browser.waitFor(5,TimeUnit.SECONDS))browser.destroyForcibly().waitFor(5,TimeUnit.SECONDS);}
            if(host!=null&&host.isAlive()){host.destroy();if(!host.waitFor(15,TimeUnit.SECONDS))host.destroyForcibly().waitFor(5,TimeUnit.SECONDS);}
            assertFalse(host!=null&&host.isAlive());assertFalse(browser!=null&&browser.isAlive());
            boolean gitExited=!Files.exists(session.resolve("running.json"))||processExited();
            assertTrue(gitExited,"Owned Git identity must not survive cleanup");
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));admin.execute("DROP SCHEMA "+schema+" CASCADE");
            assertEquals(0,admin.queryForObject("SELECT count(*) FROM pg_namespace WHERE nspname=?",Integer.class,schema));
            assertEquals(original,digests(admin,"eap"));
            write("cleanup.json",Map.of("ownedSchemaDropped",true,"applicationRecordsUnchanged",true,"capturedGitExited",gitExited,"hostStopped",host==null||!host.isAlive(),"browserStopped",browser==null||!browser.isAlive()));
        }
    }
    boolean processExited()throws Exception{
        var identity=read("running.json");
        var status=new LocalProcessIdentityInspector().inspect(((Number)identity.get("processPid")).longValue(),
                (String)identity.get("processStartedAt"),(String)identity.get("processExecutable")).status();
        return Set.of("NOT_FOUND","MATCHING_EXITED","IDENTITY_MISMATCH").contains(status);
    }
    void verifyCountsAndScope(JdbcTemplate jdbc) throws Exception {
        var task=UUID.randomUUID();jdbc.update("INSERT INTO eap.board_task(id,project_id,title) VALUES (?,'scope-matrix','Persisted fixtures only')",task);
        for(int i=0;i<26;i++){
            var id=UUID.randomUUID();jdbc.update("""
                    INSERT INTO eap.mission_execution(id,mission_id,status,capability,principal,workspace_path,workspace_label,executable,
                    policy_snapshot,started_at,approval,created_at,unconfirmed_reason)
                    VALUES (?,?,'RUNNING','git-status','local-operator',?,'owned','git','test',now(),'NOT_REQUIRED',now(),?)
                    """,id,UUID.randomUUID(),"fixture-"+i,i==0?null:"restart exit unconfirmed");
            jdbc.update("INSERT INTO eap.board_task_run(execution_id,task_id,request_id,task_revision,task_snapshot) VALUES (?,?,?,1,'{}')",id,task,UUID.randomUUID());
            if(i==0)jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE execution_id=?",
                    "{\"id\":\""+UUID.randomUUID()+"\",\"status\":\"QUEUED\",\"plan\":{\"workspacePath\":\"owned\",\"planHash\":\""+"a".repeat(64)+"\"},\"checks\":[],\"startedAt\":null}",id);
            if(i==1)jdbc.update("UPDATE eap.board_task_run SET verification_snapshot=?::jsonb WHERE execution_id=?",
                    "{\"id\":\""+UUID.randomUUID()+"\",\"status\":\"UNKNOWN\",\"reason\":\"BOARD_VERIFICATION_PROCESS_UNKNOWN\",\"workspacePath\":\"owned-unknown\",\"plan\":null,\"checks\":[],\"startedAt\":null,\"sourceAfter\":null,\"finishedAt\":null}",id);
        }
        for(var state:List.of("APPLYING","UNKNOWN")){
            var gen=UUID.randomUUID();var proposal=UUID.randomUUID();var conversation=UUID.randomUUID();
            var snapshot=new LinkedHashMap<String,Object>(Map.of("projectId","scope-matrix","taskId",task,"revision",1,"title","fixture","goal","bounded","acceptanceCriteria","read only"));snapshot.put("prototype",null);
            jdbc.update("INSERT INTO eap.code_generation(id,principal,conversation_id,workspace,target_path,base_hash,captured_at,task_project_id,task_id,task_revision,task_snapshot) VALUES (?,'fixture',?,?, 'file.ts','absent',now(),'scope-matrix',?,1,?::jsonb)",
                    gen,conversation,"owned-"+state,task,ToolUnknownReviewFixture.JSON.writeValueAsString(snapshot));
            jdbc.update("INSERT INTO eap.code_proposal(id,generation_id,principal,conversation_id,workspace,proposal,status,started_at) VALUES (?,?,'fixture',?,?,?::jsonb,?,now())",
                    proposal,gen,conversation,"owned-"+state,ToolUnknownReviewFixture.JSON.writeValueAsString(Map.of("id",proposal,"conversationId",conversation,"workspace","owned-"+state,"generation",Map.of("id",gen),"files",List.of(Map.of()))),state);
        }
        var before=digests(jdbc,"eap");var service=new BoardRuntimeService(jdbc);var snapshot=service.inspect("scope-matrix");
        assertEquals(1,snapshot.taskCount());assertEquals(26,snapshot.runCount());assertEquals(1,snapshot.activeRunCount());assertEquals(25,snapshot.unknownRunCount());
        assertEquals(1,snapshot.activeVerificationCount());assertEquals(1,snapshot.unknownVerificationCount());assertEquals(1,snapshot.activeWriteCount());assertEquals(1,snapshot.unknownWriteCount());
        assertEquals(20,snapshot.items().size());assertTrue(snapshot.truncated());assertTrue(snapshot.items().stream().allMatch(a->a.status().equals("UNKNOWN")));
        assertTrue(snapshot.items().stream().filter(a->a.kind().equals("RUN")).allMatch(a->a.storedStatus().equals("RUNNING")));
        assertEquals(0,service.inspect("scope-matrix-other").taskCount());assertTrue(service.inspect("scope-matrix-other").items().isEmpty());
        assertThrows(IllegalArgumentException.class,()->service.inspect(" "));assertThrows(IllegalArgumentException.class,()->service.inspect("x".repeat(121)));
        assertEquals(before,digests(jdbc,"eap"));write("scope-result.json",snapshot);
    }
    static Map<String,Object> digests(JdbcTemplate jdbc,String schema){
        var result=new LinkedHashMap<String,Object>();for(var table:TABLES)result.put(table,jdbc.queryForMap("SELECT count(*) AS n,coalesce(md5(string_agg(md5(to_jsonb(t)::text),',' ORDER BY md5(to_jsonb(t)::text))),'empty') AS digest FROM "+schema+"."+table+" t"));return result;
    }
    void await(String name)throws Exception{long until=System.nanoTime()+Duration.ofSeconds(60).toNanos();while(!Files.exists(session.resolve(name))&&System.nanoTime()<until){if(browser!=null&&!browser.isAlive())fail(text("browser.log"));if(host!=null&&!host.isAlive())fail(text("host.log"));Thread.sleep(50);}assertTrue(Files.exists(session.resolve(name)),"Missing "+name);}
    @SuppressWarnings("unchecked") Map<String,Object> read(String name)throws Exception{return ToolUnknownReviewFixture.JSON.readValue(text(name),Map.class);}
    void write(String name,Object value)throws Exception{Files.writeString(session.resolve(name),ToolUnknownReviewFixture.JSON.writeValueAsString(value));}
    String text(String name){try{return Files.readString(session.resolve(name));}catch(Exception missing){return "";}}
    @SuppressWarnings("unchecked") Map<String,Object> request(String method,String path,Object body,int code)throws Exception{
        var req=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(10)).header("Content-Type","application/json").method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(ToolUnknownReviewFixture.JSON.writeValueAsString(body))).build();
        var response=http.send(req,HttpResponse.BodyHandlers.ofString());assertEquals(code,response.statusCode(),response.body());return ToolUnknownReviewFixture.JSON.readValue(response.body(),Map.class);
    }
}
