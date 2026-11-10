package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.lh.eap.skill.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

@EnabledIfEnvironmentVariable(named="EAP_RUN_BOARD_PERSISTENCE", matches="true")
class SkillChatPersistenceTest {
    @TempDir Path root;
    JdbcTemplate jdbc; SkillService skills; String scope;
    final String name = "fixture-" + UUID.randomUUID();
    final tools.jackson.databind.json.JsonMapper json = tools.jackson.databind.json.JsonMapper.builder().build();
    @BeforeEach void connect() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application",new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"));
        var ds = new DriverManagerDataSource(url,env.getProperty("spring.datasource.username"),env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(ds);
        var target = new SkillService(jdbc,new SkillTextParser(),RuntimeWorkspace.colocated(root,""),new CapabilityHandlerRegistry(List.of()));
        var proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(ds),new AnnotationTransactionAttributeSource()));
        skills = (SkillService)proxy.getProxy();
    }
    @AfterEach void cleanup() {
        if (jdbc != null && scope != null) {
            jdbc.update("DELETE FROM eap.skill_version WHERE scope=? AND id=?",scope,name);
            assertEquals(0,jdbc.queryForObject("SELECT count(*) FROM eap.skill_version WHERE scope=? AND id=?",Integer.class,scope,name));
        }
    }
    SkillService.Snapshot install(String version, String text) {
        var input = Map.of("rawSkillMd","---\nname: " + name + "\ndescription: fixture\n---\n" + text,"version",version,"sourceLabel","owned fixture",
                "resources",List.of(Map.of("path","guide.md","mediaType","text/markdown","content","selected-private"),Map.of("path","hidden.txt","mediaType","text/plain","content","not-selected-private")),
                "requiredCapabilities",List.of("unknown.tool"));
        var preview = skills.preview(input); scope=preview.scope();
        skills.save(Map.of("input",input,"expectedDigest",preview.digest(),"confirmed",true));
        return skills.activate(name,version,Map.of("enabled",true,"stateRevision",1));
    }
    SkillRef ref(SkillService.Snapshot s) { return new SkillRef(s.id(),s.version(),s.digest(),s.stateRevision()); }
    String send(SkillRef ref) { return json.writeValueAsString(Map.of("message","normal","toolMode","none","context",Map.of("skillRef",ref,"skillResourcePaths",List.of("guide.md")))); }
    @Test void exactVersionsRollbackDisableAndRejectedTurnsNeverReplayOldMaterials() throws Exception {
        var old = install("1.0.0","old-private"); var next = install("2.0.0","new-private");
        assertEquals(List.of("guide.md"),skills.resolve(ref(old),List.of("guide.md")).resources().stream().map(SkillTextParser.Resource::path).toList());
        assertEquals("INVALID_SKILL_RESOURCE_PATHS",assertThrows(ResponseStatusException.class,()->skills.resolve(ref(old),List.of("missing.md"))).getReason());
        var helper = new AiChatApplicationTest(); helper.root=root;
        var seen = new ArrayList<org.springframework.ai.chat.prompt.Prompt>();
        var toolCalls = new java.util.concurrent.atomic.AtomicInteger();
        var app = helper.app(p -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(),"No database transaction during model call");
            seen.add(p); return FakeChatModels.text("derived-private");
        },true,root,toolCalls);
        ReflectionTestUtils.setField(app,"skills",skills);
        var id=app.open("{}").conversationId();
        assertTrue(app.send(id,send(ref(old))).contextMemoryCleared());
        assertTrue(seen.getLast().getUserMessage().getText().contains("old-private"));
        assertFalse(seen.getLast().getSystemMessage().getText().contains("old-private"));
        assertFalse(seen.getLast().toString().contains("not-selected-private"));
        app.send(id,send(ref(next)));
        assertFalse(seen.getLast().toString().contains("old-private")); assertTrue(seen.getLast().toString().contains("new-private"));
        var disabled=skills.activate(name,"1.0.0",Map.of("enabled",false,"stateRevision",old.stateRevision()));
        assertEquals("SKILL_DISABLED",assertThrows(ResponseStatusException.class,()->app.send(id,send(ref(disabled)))).getReason());
        assertEquals(2,seen.size());
        var registry=(AiConversationRegistry)ReflectionTestUtils.getField(app,"conversations");
        var memory=(org.springframework.ai.chat.memory.ChatMemory)ReflectionTestUtils.getField(registry,"memory");
        assertTrue(memory.get(EngineeringChatService.memoryKey(AiConversationRegistry.PRINCIPAL,id)).isEmpty());
        var rollback=skills.activate(name,"1.0.0",Map.of("enabled",true,"stateRevision",disabled.stateRevision()));
        assertEquals("SKILL_REF_STALE",assertThrows(ResponseStatusException.class,()->app.send(id,send(ref(old)))).getReason());
        app.send(id,send(ref(rollback)));
        assertTrue(seen.getLast().toString().contains("old-private")); assertFalse(seen.getLast().toString().contains("new-private"));
        assertThrows(ResponseStatusException.class,()->app.send(id,"{"));
        app.send(id,ExpertKnowledgeChatTest.PLAIN);
        assertFalse(seen.getLast().toString().contains("private")); assertEquals(0,toolCalls.get());
        assertEquals("unknown",skills.resolve(ref(rollback),List.of()).dependencies().getFirst().status());
    }
}
