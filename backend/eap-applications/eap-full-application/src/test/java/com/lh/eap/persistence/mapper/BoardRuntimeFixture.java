package com.lh.eap.persistence.mapper;

import com.lh.eap.api.*;
import com.lh.eap.application.service.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.*;
import com.lh.eap.runtime.handler.*;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import javax.sql.DataSource;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;

/** Test-only host: real core BoardRun/Mission/Git and production read observation. */
public final class BoardRuntimeFixture {
    static Path session;
    static String schema;
    public static void main(String[] args) throws Exception {
        session=Path.of(args[0]).toAbsolutePath().normalize(); schema=args[1];
        var context=new SpringApplicationBuilder(Host.class).run("--spring.config.name=board-runtime-fixture",
                "--server.address=127.0.0.1","--server.port=0","--spring.flyway.enabled=false",
                "--spring.ai.model.chat=none","--spring.ai.model.embedding=none","--spring.ai.model.image=none",
                "--spring.ai.model.audio.speech=none","--spring.ai.model.audio.transcription=none","--spring.ai.model.moderation=none",
                "--spring.mvc.problemdetails.enabled=true","--eap.web.allowed-origins=http://127.0.0.1:5187");
        Files.writeString(session.resolve("host.json"),ToolUnknownReviewFixture.JSON.writeValueAsString(Map.of(
                "port",Integer.parseInt(context.getEnvironment().getProperty("local.server.port")),"pid",ProcessHandle.current().pid())));
    }
    @Configuration(proxyBeanMethods=false) @EnableAutoConfiguration @EnableTransactionManagement
    @Import({BoardTaskController.class,BoardRunController.class,BoardRuntimeController.class,AiBrowserRequestGuard.class})
    static class Host {
        @Bean DataSource source(){return ToolUnknownReviewFixture.scopedDataSource(schema);}
        @Bean JdbcTemplate jdbc(DataSource source){return new JdbcTemplate(source);}
        @Bean PlatformTransactionManager manager(DataSource source){return new DataSourceTransactionManager(source);}
        @Bean BoardRuntimeService runtime(JdbcTemplate jdbc){return new BoardRuntimeService(jdbc);}
        @Bean BoardTaskService tasks(JdbcTemplate jdbc){return new BoardTaskService(jdbc);}
        @Bean HandoffStore handoffs(JdbcTemplate jdbc){return new JdbcHandoffStore(jdbc);}
        @Bean MissionStore missions(JdbcTemplate jdbc){return new JdbcMissionStore(jdbc);}
        @Bean MissionExecutionStore executions(JdbcTemplate jdbc){return new JdbcMissionExecutionStore(jdbc);}
        @Bean MissionService missionService(HandoffStore handoffs,MissionStore missions){return new MissionService(handoffs,missions);}
        @Bean CapabilityRegistry registry(){return new CapabilityRegistry().register(new GitCapability("status"));}
        @Bean CapabilitySettings settings(JdbcTemplate jdbc){return new CapabilitySettings(jdbc,null);}
        @Bean(destroyMethod="close") DefaultProcessExecutor executor(){return new DefaultProcessExecutor(Duration.ofMinutes(3));}
        @Bean MissionGitExecutionService git(MissionStore missions,MissionExecutionStore executions,CapabilityRegistry registry,
                CapabilitySettings settings,DefaultProcessExecutor executor){
            var handlers=new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry,executor)));
            var claimed=new java.util.concurrent.atomic.AtomicBoolean();
            ProcessExecutor gated=new ProcessExecutor(){
                public Observation run(String name,Path dir,List<String> argv){throw new UnsupportedOperationException();}
                public Observation runIsolated(String name,Path dir,List<String> argv,Map<String,String> env){return executor.runIsolated(name,dir,argv,env);}
                public Observation runManaged(UUID id,String name,Path dir,List<String> argv,Map<String,String> env){
                    if(!claimed.compareAndSet(false,true))return executor.runManaged(id,name,dir,argv,env);
                    return executor.runManaged(id,name,dir,argv,env,identity->{
                        try{
                            Files.writeString(session.resolve("running.json"),ToolUnknownReviewFixture.JSON.writeValueAsString(identity));
                            long until=System.nanoTime()+Duration.ofSeconds(120).toNanos();
                            while(!Files.exists(session.resolve("release.request"))&&System.nanoTime()<until)Thread.sleep(10);
                            if(!Files.exists(session.resolve("release.request")))throw new IllegalStateException("Board acceptance gate timed out");
                        }catch(Exception error){throw new IllegalStateException(error);}
                    });
                }
            };
            return new MissionGitExecutionService(missions,executions,handlers,settings,registry,gated,
                    RuntimeWorkspace.colocated(session.resolve("workspace"),""));
        }
        @Bean PrototypeVersionService versions(JdbcTemplate jdbc){return new PrototypeVersionService(new JdbcPrototypeVersionStore(jdbc),new JdbcPrototypeDeliveryStore(jdbc));}
        @Bean BoardPrototypeService prototypes(JdbcTemplate jdbc,BoardTaskService tasks,PrototypeVersionService versions){return new BoardPrototypeService(jdbc,tasks,versions);}
        @Bean BoardRunService runs(JdbcTemplate jdbc,BoardTaskService tasks,HandoffStore handoffs,MissionService missions,
                MissionExecutionStore executions,MissionGitExecutionService git,PlatformTransactionManager manager,BoardPrototypeService prototypes){
            return new BoardRunService(jdbc,tasks,handoffs,missions,executions,git,manager,prototypes);
        }
    }
}
