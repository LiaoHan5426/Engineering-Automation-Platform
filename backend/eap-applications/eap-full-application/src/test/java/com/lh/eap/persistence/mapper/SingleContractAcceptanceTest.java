package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.application.service.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.*;
import com.lh.eap.domain.model.ExpertBehaviorBinding;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.runtime.handler.*;
import com.lh.eap.rules.RulePack;
import com.lh.eap.rules.RulePackService;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.*;
import java.net.URI;
import java.net.http.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Real Flyway/PostgreSQL/socket HTTP/Git; no model or external service. Mutates only UUID-owned data. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_SINGLE_CONTRACTS",matches="true")
class SingleContractAcceptanceTest {
    static Path workspace;
    static String schema;
    static final tools.jackson.databind.json.JsonMapper JSON=tools.jackson.databind.json.JsonMapper.builder().build();
    final HttpClient client=HttpClient.newHttpClient();
    String base;

    @Test void convergesConfigurationBindingsExpertsDesignsAndExecutionIdentity() throws Exception {
        Path repo=Path.of("").toAbsolutePath();while(!Files.isDirectory(repo.resolve("frontend")))repo=repo.getParent();
        Path session=repo.resolve("backend/target/single-contracts-"+UUID.randomUUID());Files.createDirectories(session);
        workspace=Files.createDirectory(session.resolve("workspace"));
        git("init","--quiet");Files.writeString(workspace.resolve("sample.txt"),"before\n");git("add","sample.txt");
        git("-c","user.name=EAP Test","-c","user.email=test@localhost","commit","--quiet","-m","fixture");
        Files.writeString(workspace.resolve("sample.txt"),"after\n");byte[] index=Files.readAllBytes(workspace.resolve(".git/index"));
        schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
        var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        var original=DesignerLifecycleAcceptanceTest.digests(admin,"eap");
        try {
            CurrentContractTestSchema.migrate(session,schema,"29");
            var jdbc=new JdbcTemplate(ToolUnknownReviewFixture.scopedDataSource(schema));
            jdbc.update("INSERT INTO eap.cli_channel(capability,binary_path) VALUES ('git-status','old-git')");
            assertThrows(RuntimeException.class,()->CurrentContractTestSchema.migrate(session,schema));
            assertEquals("29",jdbc.queryForObject("SELECT version FROM eap.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1",String.class));
            jdbc.update("DELETE FROM eap.cli_channel WHERE capability='git-status'");
            jdbc.update("INSERT INTO eap.expert_definition(id,name,manifest) VALUES ('old-expert','old','{}'::jsonb)");
            assertThrows(RuntimeException.class,()->CurrentContractTestSchema.migrate(session,schema));
            jdbc.update("DELETE FROM eap.expert_definition WHERE id='old-expert'");
            // Shipped definitions must satisfy the exact same contract as authored definitions.
            var shipped=new String(getClass().getResourceAsStream("/experts/sql-expert.json").readAllBytes(),java.nio.charset.StandardCharsets.UTF_8);
            assertEquals(new ExpertBehaviorBinding("sql-analysis",1),com.lh.eap.domain.model.ExpertManifest.parse(shipped).behavior());
            CurrentContractTestSchema.migrate(session,schema);
            assertEquals("31",jdbc.queryForObject("SELECT version FROM eap.flyway_schema_history WHERE success ORDER BY installed_rank DESC LIMIT 1",String.class));
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("INSERT INTO eap.cli_channel(program_id,binary_path) VALUES ('git-status','old-git')"));
            assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("INSERT INTO eap.expert_definition(id,name,manifest) VALUES ('invalid','invalid','{}'::jsonb)"));

            try(var context=new SpringApplicationBuilder(Host.class).run("--spring.config.name=single-contract-fixture",
                    "--server.address=127.0.0.1","--server.port=0","--spring.flyway.enabled=false",
                    "--spring.ai.model.chat=none","--spring.ai.model.embedding=none","--spring.ai.model.image=none",
                    "--spring.ai.model.audio.speech=none","--spring.ai.model.audio.transcription=none","--spring.ai.model.moderation=none")) {
                base="http://127.0.0.1:"+context.getEnvironment().getProperty("local.server.port");
                assertEquals(workspace.toRealPath(),context.getBean(RuntimeWorkspace.class).root().path());
                request("POST","/api/runtime/trusted-tools/git-status/invoke",Map.of(),404);
                var catalog=request("GET","/api/runtime/trusted-tools",null,200).toString();
                assertTrue(catalog.contains("/api/cli-programs/git/operations/git-status/executions"));
                String binary=com.lh.eap.core.LocalBinaries.resolve("git").orElseThrow().toString();
                request("PUT","/api/cli-programs/git",Map.of("binary",binary),200);
                assertEquals(Map.of("git",binary),context.getBean(CliChannels.class).overrides());
                for(var operation:List.of("git-status","git-diff")) {
                    String route="/api/cli-programs/git/operations/"+operation+"/executions";
                    var input=Map.of("requestId",UUID.randomUUID().toString());
                    var row=request("POST",route,input,202);
                    assertEquals(row.get("id"),request("POST",route,input,202).get("id"));
                    long until=System.nanoTime()+Duration.ofSeconds(20).toNanos();
                    do {row=request("GET",route+"/"+row.get("id"),null,200);if(List.of("SUCCEEDED","FAILED","UNKNOWN").contains(row.get("status")))break;Thread.sleep(20);}while(System.nanoTime()<until);
                    assertEquals("SUCCEEDED",row.get("status"),row.toString());assertEquals(0,row.get("exitCode"));
                }
                request("PUT","/api/cli-programs/git",Map.of("binary",""),200);
                assertTrue(context.getBean(CliChannels.class).overrides().isEmpty());
                assertEquals("git",context.getBean(CliChannels.class).binaryFor("git-diff","git"));

                var manifest=new LinkedHashMap<String,Object>(Map.of("apiVersion","eap/v1","kind","Expert","id","reviewer","name","Reviewer",
                        "steps",List.of(Map.of("id","inspect","capability","git-status","required",true)),"edges",List.of(),
                        "rules",List.of("database.credentials.never-expose")));
                saveExpert(manifest,400);assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM eap.expert_definition",Integer.class));
                manifest.put("behavior",Map.of("id","local-review","version",1));saveExpert(manifest,200);
                request("PUT","/api/experts/reviewer/activation",Map.of("enabled",true),200);
                var run=request("POST","/api/experts/reviewer/execute",Map.of("question","inspect"),200);
                assertEquals(Map.of("id","local-review","version",1),run.get("behavior"));
                assertTrue(JSON.writeValueAsString(run.get("observations")).contains("exitCode"));
                manifest.put("behavior",Map.of("id","local-review","version",2));saveExpert(manifest,200);
                request("POST","/api/experts/reviewer/execute",Map.of("question","inspect"),409);
                request("PUT","/api/experts/reviewer/activation",Map.of("enabled",true),200);
                assertEquals(Map.of("id","local-review","version",2),request("POST","/api/experts/reviewer/execute",Map.of("question","inspect"),200).get("behavior"));
                assertEquals(Map.of("id","local-review","version",1),context.getBean(TaskRepository.class).findById(UUID.fromString(run.get("id").toString())).orElseThrow().get("observations") instanceof List<?> observations
                        ? ((Map<?,?>)((Map<?,?>)observations.getFirst()).get("metadata")).get("behavior") : null);
                manifest.remove("behavior");saveExpert(manifest,400);
                assertEquals(2,context.getBean(ExpertDefinitionService.class).require("reviewer",true).behavior().version());

                request("POST","/api/prototype-versions",Map.of("sourceRef","builder-alpha","title","Design","body","plain text","acceptance",List.of()),400);
                var design=Map.of("requestId",UUID.randomUUID().toString(),"sourceRef","builder-alpha","title","Design","body",SemanticPrototypeFixture.body("Design"),"acceptance",List.of("preview"));
                var forged=new LinkedHashMap<>(design);forged.put("buttonPresses",1);request("POST","/api/prototype-versions",forged,400);
                var version=request("POST","/api/prototype-versions",design,200);
                assertFalse(version.containsKey("buttonPresses"));assertFalse(version.containsKey("interaction"));
                assertEquals(version,request("GET","/api/prototype-versions/"+version.get("id"),null,200));
                var delivered=request("POST","/api/prototype-deliveries",Map.of("versionId",version.get("id")),200);
                assertEquals(delivered,request("POST","/api/prototype-deliveries",Map.of("versionId",version.get("id")),200));
                assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM information_schema.columns WHERE table_schema=? AND table_name='prototype_version' AND column_name IN ('button_presses','interaction')",Integer.class,schema));
            }
            assertArrayEquals(index,Files.readAllBytes(workspace.resolve(".git/index")));
            assertEquals("after\n",Files.readString(workspace.resolve("sample.txt")));
            Files.writeString(session.resolve("result.json"),JSON.writeValueAsString(Map.of("migration",30,"migrationRejectsOldCliAndExpert",true,"cliProgramBinding",true,"statusAndDiffPersistentIdentity",true,"explicitExpertVersionAndHistory",true,"semanticPublicationAndDelivery",true,"oldInvokeRejected",true,"gitIndexUnchanged",true)));
        } finally {
            admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");
            assertEquals(0,admin.queryForObject("SELECT count(*) FROM pg_namespace WHERE nspname=?",Integer.class,schema));
            assertEquals(original,DesignerLifecycleAcceptanceTest.digests(admin,"eap"));
            Files.writeString(session.resolve("cleanup.json"),"{\"ownedSchemaDropped\":true,\"applicationRecordsUnchanged\":true,\"hostStopped\":true}");
        }
    }

    void saveExpert(Map<String,Object> manifest,int status)throws Exception {request("POST","/api/experts",Map.of("id","reviewer","name","Reviewer","manifest",JSON.writeValueAsString(manifest)),status);}
    Map<String,Object> request(String method,String path,Object body,int status)throws Exception {
        var builder=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(30)).header("Content-Type","application/json");
        builder.method(method,body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(body)));
        var reply=client.send(builder.build(),HttpResponse.BodyHandlers.ofString());assertEquals(status,reply.statusCode(),method+" "+path+" "+reply.body());
        return reply.body().isBlank()?Map.of():JSON.readValue(reply.body(),Map.class);
    }
    static void git(String...args)throws Exception {var command=new ArrayList<>(List.of("git"));command.addAll(List.of(args));var process=new ProcessBuilder(command).directory(workspace.toFile()).redirectErrorStream(true).start();String out=new String(process.getInputStream().readAllBytes());assertEquals(0,process.waitFor(),out);}

    @Configuration(proxyBeanMethods=false) @EnableAutoConfiguration @EnableTransactionManagement
    @Import({RuntimeDataController.class,CliProgramController.class,ToolExecutionController.class,ExpertController.class,ExpertExecutionController.class,PrototypeVersionController.class,ApiErrorHandler.class,AiBrowserRequestGuard.class})
    static class Host {
        @Bean DataSource source(){return ToolUnknownReviewFixture.scopedDataSource(schema);}
        @Bean JdbcTemplate jdbc(DataSource source){return new JdbcTemplate(source);}
        @Bean Path workspace(){return workspace;}
        @Bean RuntimeWorkspace runtime(){return RuntimeWorkspace.colocated(workspace,"");}
        @Bean JdbcCliChannelStore bindings(JdbcTemplate jdbc){return new JdbcCliChannelStore(jdbc);}
        @Bean CliChannels channels(JdbcCliChannelStore bindings){return new CliChannels(bindings);}
        @Bean CliProgramMapper programs(JdbcTemplate jdbc){return new CliProgramMapper(jdbc);}
        @Bean CapabilityUsage usage(JdbcTemplate jdbc){return new CapabilityUsage(jdbc);}
        @Bean CapabilitySettings settings(JdbcTemplate jdbc,CapabilityUsage usage){return new CapabilitySettings(jdbc,usage);}
        @Bean CliProgramService cli(CliProgramMapper mapper,CliChannels channels,CapabilityUsage usage){return new CliProgramService(mapper,channels,usage);}
        @Bean(destroyMethod="close") DefaultProcessExecutor executor(){return new DefaultProcessExecutor(Duration.ofSeconds(10));}
        @Bean CapabilityRegistry registry(CliChannels channels){return new CapabilityRegistry().register(new GitCapability("status",()->channels.binaryFor("git-status","git"))).register(new GitCapability("diff",()->channels.binaryFor("git-diff","git")));}
        @Bean CapabilityHandlerRegistry handlers(CapabilityRegistry registry,DefaultProcessExecutor executor,CliChannels channels,CapabilitySettings settings){return new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry,executor,channels)),settings);}
        @Bean McpServerRegistry mcp(JdbcTemplate jdbc){return new McpServerRegistry(jdbc);}
        @Bean CapabilityCatalog catalog(CapabilityHandlerRegistry handlers,JdbcTemplate jdbc,McpServerRegistry mcp,CliChannels channels,CapabilityUsage usage){return new CapabilityCatalog(handlers,jdbc,mcp,channels,usage);}
        @Bean TrustedToolCatalogService tools(CapabilityHandlerRegistry handlers,CapabilitySettings settings,CliChannels channels,RuntimeWorkspace runtime,CliProgramMapper programs){return new TrustedToolCatalogService(handlers,settings,channels,runtime,programs);}
        @Bean RuntimeDataLayoutService layout(RuntimeWorkspace runtime){return new RuntimeDataLayoutService(runtime,workspace,".eap-ai-artifacts",".eap/model-connections.json");}
        @Bean ToolExecutionService executions(JdbcTemplate jdbc,RuntimeWorkspace runtime,CapabilitySettings settings,CapabilityHandlerRegistry handlers,CapabilityRegistry registry,DefaultProcessExecutor executor){return new ToolExecutionService(new JdbcToolExecutionStore(jdbc),runtime,settings,handlers,registry,executor);}
        @Bean RulePackService rules(JdbcTemplate jdbc){return new RulePackService(jdbc);}
        @Bean ExpertBehaviorCatalog policies(){
            ExpertAnalysisPolicy policy=new ExpertAnalysisPolicy(){
                public Rules rules(List<String> ids){return new Rules(List.of(),List.of());}
                public Set<String> allowedFacts(){return Set.of();}
                public Map<String,Object> judge(Map<String,Object> input,List<RulePack> rules,Set<String> capabilities){return Map.of("checked",true);}
                public List<Map<String,Object>> summarize(List<RulePack> rules){return List.of();}
                public Enhancement enhance(Evidence input,boolean failed,boolean requested){return new Enhancement(null,"skipped",Map.of());}
            };
            return new ExpertBehaviorCatalog(List.of(new ExpertBehaviorCatalog.Registration(new ExpertBehaviorBinding("local-review",1),"Local 1",policy),new ExpertBehaviorCatalog.Registration(new ExpertBehaviorBinding("local-review",2),"Local 2",policy)));
        }
        @Bean ExpertDefinitionMapper mapper(JdbcTemplate jdbc){return new ExpertDefinitionMapper(jdbc);}
        @Bean ExpertDefinitionService definitions(JdbcTemplate jdbc,RulePackService rules,McpServerRegistry mcp,CapabilitySettings settings,ExpertBehaviorCatalog policies){return new ExpertDefinitionService(jdbc,rules,mcp,settings,policies);}
        @Bean ExpertManagementService management(ExpertDefinitionMapper mapper,ExpertDefinitionService definitions,RulePackService rules,CapabilityCatalog catalog){return new ExpertManagementService(mapper,definitions,rules,catalog);}
        @Bean TaskRepository tasks(JdbcTemplate jdbc){return new TaskRepository(jdbc);}
        @Bean ExpertExecutionService experts(ExpertDefinitionService definitions,TaskRepository tasks,CapabilityHandlerRegistry handlers,ExpertBehaviorCatalog policies){return new ExpertExecutionService(definitions,tasks,handlers,policies,workspace,List.of());}
        @Bean PrototypeVersionService versions(JdbcTemplate jdbc){return new PrototypeVersionService(new JdbcPrototypeVersionStore(jdbc),new JdbcPrototypeDeliveryStore(jdbc));}
    }
}
