package com.lh.eap.persistence.mapper;

import com.lh.eap.application.service.*;
import com.lh.eap.web.AiBrowserRequestGuard;
import com.lh.eap.web.controller.*;
import java.nio.file.*;
import java.time.Duration;
import java.util.Map;
import javax.sql.DataSource;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

/** Real prototype/scenario HTTP adapters and stores. A test-only latch delays the first publish response. */
public final class DesignerLifecycleFixture {
    static Path session;
    static String schema;
    public static void main(String[] args) throws Exception {
        session=Path.of(args[0]);schema=args[1];
        var context=new SpringApplicationBuilder(Host.class).run("--spring.config.name=designer-lifecycle-fixture",
                "--server.address=127.0.0.1","--server.port=0","--spring.flyway.enabled=false",
                "--spring.ai.model.chat=none","--spring.ai.model.embedding=none","--spring.ai.model.image=none",
                "--spring.ai.model.audio.speech=none","--spring.ai.model.audio.transcription=none","--spring.ai.model.moderation=none",
                "--spring.mvc.problemdetails.enabled=true","--eap.web.allowed-origins=http://127.0.0.1:5187");
        Files.writeString(session.resolve("host.json"),ToolUnknownReviewFixture.JSON.writeValueAsString(Map.of(
                "port",context.getEnvironment().getProperty("local.server.port"),"pid",ProcessHandle.current().pid())));
    }
    @Configuration(proxyBeanMethods=false) @EnableAutoConfiguration
    @Import({PrototypeVersionController.class,ScenarioController.class,AiBrowserRequestGuard.class ,com.lh.eap.web.i18n.PlatformMessagesConfiguration.class,com.lh.eap.web.i18n.ProblemResponses.class})
    static class Host {
        @Bean DataSource source(){return ToolUnknownReviewFixture.scopedDataSource(schema);}
        @Bean JdbcTemplate jdbc(DataSource source){return new JdbcTemplate(source);}
        @Bean ScenarioService scenarios(JdbcTemplate jdbc){return new ScenarioService(jdbc);}
        @Bean PrototypeVersionService versions(JdbcTemplate jdbc){return new PrototypeVersionService(new JdbcPrototypeVersionStore(jdbc),new JdbcPrototypeDeliveryStore(jdbc));}
        @Bean OncePerRequestFilter publishLatch(){
            var first=new java.util.concurrent.atomic.AtomicBoolean();
            return new OncePerRequestFilter(){
                @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws java.io.IOException,ServletException {
                    if(!request.getMethod().equals("POST")||!request.getRequestURI().equals("/api/prototype-versions")||!first.compareAndSet(false,true)){chain.doFilter(request,response);return;}
                    var buffered=new ContentCachingResponseWrapper(response);chain.doFilter(request,buffered);
                    Files.writeString(session.resolve("publish-waiting.json"),"{\"persisted\":"+(buffered.getStatus()==200)+"}");
                    long until=System.nanoTime()+Duration.ofSeconds(90).toNanos();
                    while(!Files.exists(session.resolve("release-publish.request"))&&System.nanoTime()<until){
                        try{Thread.sleep(20);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();break;}
                    }
                    buffered.copyBodyToResponse();
                }
            };
        }
    }
}
