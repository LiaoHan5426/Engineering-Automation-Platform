package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;

/** Opt-in browser/socket/local PostgreSQL acceptance. Only a UUID-owned schema is mutated. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_DESIGNER_LIFECYCLE",matches="true")
class DesignerLifecycleAcceptanceTest {
    static final List<String> TABLES=List.of("prototype_version","prototype_delivery","scenario_definition");
    @Test void preservesDraftsVersionsAndScenarioDependenciesAcrossDisableReloadAndServiceRecovery()throws Exception{
        assertEquals("true",System.getenv("EAP_RUN_BOARD_PERSISTENCE"));
        assertNotNull(System.getenv("EAP_PLAYWRIGHT_MODULE"));assertNotNull(System.getenv("EAP_CHROMIUM"));
        Path repo=Path.of("").toAbsolutePath();while(!Files.isDirectory(repo.resolve("frontend")))repo=repo.getParent();
        Path session=repo.resolve("backend/target/designer-lifecycle-"+UUID.randomUUID());Files.createDirectories(session);
        String schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
        var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());var original=digests(admin,"eap");
        Process host=null,browser=null;boolean unavailable=false,faultApplied=false;
        admin.execute("CREATE SCHEMA "+schema);
        try{
            CurrentContractTestSchema.migrate(session,schema);
            host=new ProcessBuilder(Path.of(System.getProperty("java.home"),"bin","java").toString(),
                    "-Dspring.devtools.restart.enabled=false","-Dstdout.encoding=UTF-8","-Dstderr.encoding=UTF-8","-cp",
                    System.getProperty("surefire.test.class.path",System.getProperty("java.class.path")),DesignerLifecycleFixture.class.getName(),session.toString(),schema)
                    .redirectErrorStream(true).redirectOutput(session.resolve("host.log").toFile()).start();
            await(session,"host.json",host);
            var info=ToolUnknownReviewFixture.JSON.readValue(Files.readString(session.resolve("host.json")),Map.class);
            assertEquals(host.pid(),((Number)info.get("pid")).longValue());
            Files.writeString(session.resolve("browser-input.json"),ToolUnknownReviewFixture.JSON.writeValueAsString(Map.of(
                    "base","http://127.0.0.1:"+info.get("port"),"session",session.toString(),"frontend",repo.resolve("frontend").toString())));
            browser=new ProcessBuilder("node",repo.resolve("frontend/apps/web/__tests__/browser/designer-lifecycle-live.mjs").toString(),"--session",session.toString())
                    .directory(repo.resolve("frontend").toFile()).redirectErrorStream(true).redirectOutput(session.resolve("browser.log").toFile()).start();
            long until=System.nanoTime()+Duration.ofMinutes(3).toNanos();
            while(browser.isAlive()&&System.nanoTime()<until){
                if(Files.exists(session.resolve("fail-service.request"))&&!faultApplied){
                    admin.execute("ALTER TABLE "+schema+".prototype_version RENAME TO prototype_version_unavailable");unavailable=true;faultApplied=true;
                    Files.writeString(session.resolve("service-failed.json"),"true");
                }
                if(Files.exists(session.resolve("restore-service.request"))&&unavailable){
                    admin.execute("ALTER TABLE "+schema+".prototype_version_unavailable RENAME TO prototype_version");unavailable=false;
                    Files.writeString(session.resolve("service-restored.json"),"true");
                }
                Thread.sleep(30);
            }
            assertFalse(browser.isAlive(),"Browser timed out");assertEquals(0,browser.exitValue(),()->text(session,"browser.log"));
            var jdbc=new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
            assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version",Integer.class));
            assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version WHERE source_ref='builder-alpha'",Integer.class));
            assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM eap.prototype_version WHERE source_ref='builder-beta'",Integer.class));
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM eap.prototype_delivery",Integer.class));
            assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM eap.scenario_definition WHERE definition->>'workflow'='prototype-to-code' AND NOT deleted",Integer.class));
            Files.writeString(session.resolve("jdbc-result.json"),ToolUnknownReviewFixture.JSON.writeValueAsString(Map.of(
                    "versions",jdbc.queryForList("SELECT id,source_ref,title,content_hash FROM eap.prototype_version ORDER BY source_ref"),
                    "scenarios",jdbc.queryForList("SELECT id,revision,definition->>'workflow' AS workflow FROM eap.scenario_definition"),"originalDataUnchanged",original.equals(digests(admin,"eap")))));
        }finally{
            Files.writeString(session.resolve("release-publish.request"),"cleanup");
            if(browser!=null&&browser.isAlive()){browser.destroy();if(!browser.waitFor(5,TimeUnit.SECONDS))browser.destroyForcibly().waitFor(5,TimeUnit.SECONDS);}
            if(host!=null&&host.isAlive()){host.destroy();if(!host.waitFor(15,TimeUnit.SECONDS))host.destroyForcibly().waitFor(5,TimeUnit.SECONDS);}
            assertFalse(browser!=null&&browser.isAlive());assertFalse(host!=null&&host.isAlive());
            assertTrue(schema.matches("eap_unknown_qa_[a-f0-9]{32}"));admin.execute("DROP SCHEMA "+schema+" CASCADE");
            assertEquals(0,admin.queryForObject("SELECT count(*) FROM pg_namespace WHERE nspname=?",Integer.class,schema));
            assertEquals(original,digests(admin,"eap"));
            Files.writeString(session.resolve("cleanup.json"),"{\"ownedSchemaDropped\":true,\"applicationRecordsUnchanged\":true,\"hostStopped\":true,\"browserStopped\":true}");
        }
    }
    static Map<String,Object> digests(JdbcTemplate jdbc,String schema){
        var result=new LinkedHashMap<String,Object>();for(var table:TABLES)result.put(table,jdbc.queryForMap("SELECT count(*) AS n,coalesce(md5(string_agg(md5(to_jsonb(t)::text),',' ORDER BY md5(to_jsonb(t)::text))),'empty') AS digest FROM "+schema+"."+table+" t"));return result;
    }
    static void await(Path session,String name,Process host)throws Exception{
        long until=System.nanoTime()+Duration.ofSeconds(60).toNanos();while(!Files.exists(session.resolve(name))&&System.nanoTime()<until){assertTrue(host.isAlive(),()->text(session,"host.log"));Thread.sleep(40);}assertTrue(Files.exists(session.resolve(name)),name);
    }
    static String text(Path session,String name){try{return Files.readString(session.resolve(name));}catch(Exception missing){return "missing "+name;}}
}
