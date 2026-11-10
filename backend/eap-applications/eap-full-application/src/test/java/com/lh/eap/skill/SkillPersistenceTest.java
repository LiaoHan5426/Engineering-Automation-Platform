package com.lh.eap.skill;

import static org.junit.jupiter.api.Assertions.*;
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
import org.springframework.web.server.ResponseStatusException;

/** Uses only the approved existing migrated localhost DB; never migrates/repairs/resets it. */
@EnabledIfEnvironmentVariable(named="EAP_RUN_BOARD_PERSISTENCE", matches="true")
class SkillPersistenceTest {
    @TempDir Path root;
    JdbcTemplate jdbc; SkillService service; String ownedScope;
    final String name = "fixture-" + UUID.randomUUID();
    @BeforeEach void connect() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url");
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"));
        var ds = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(ds);
        service = create(root);
        var proxy = new ProxyFactory(service); proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(ds), new AnnotationTransactionAttributeSource()));
        service = (SkillService) proxy.getProxy();
        ownedScope = service.preview(input()).scope();
    }
    SkillService create(Path path) { return new SkillService(jdbc, new SkillTextParser(), RuntimeWorkspace.colocated(path, ""), new CapabilityHandlerRegistry(List.of())); }
    Map<String,Object> input() { return SkillTextParserTest.input("---\nname: " + name + "\ndescription: fixture\n---\nprivate instruction\n"); }
    SkillService.Snapshot save(Map<String,Object> input, String digest) {
        return service.save(Map.of("input", input, "expectedDigest", digest, "confirmed", true));
    }
    SkillService.Snapshot activate(boolean enabled, long revision) {
        return service.activate(name, "1.0.0", Map.of("enabled",enabled,"stateRevision",revision));
    }
    @AfterEach void cleanup() {
        if (jdbc != null && ownedScope != null && Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass('eap.skill_version') IS NOT NULL", Boolean.class))) {
            jdbc.update("DELETE FROM eap.skill_version WHERE scope=? AND id=?", ownedScope, name);
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.skill_version WHERE scope=? AND id=?", Integer.class, ownedScope, name));
        }
    }
    @Test void activationCompareAndSetHasExactlyOneConcurrentWinner() throws Exception {
        var preview=service.preview(input()); save(input(),preview.digest());
        var start=new java.util.concurrent.CountDownLatch(1);
        try (var pool=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var one=pool.submit(()-> { start.await(); try { return activate(true,1).enabled() ? "ok" : "bad"; } catch(ResponseStatusException e) { return e.getReason(); } });
            var two=pool.submit(()-> { start.await(); try { return activate(false,1).enabled() ? "bad" : "ok"; } catch(ResponseStatusException e) { return e.getReason(); } });
            start.countDown();
            var outcomes=List.of(one.get(10,java.util.concurrent.TimeUnit.SECONDS),two.get(10,java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(1,outcomes.stream().filter("ok"::equals).count());
            assertEquals(1,outcomes.stream().filter("SKILL_STATE_STALE"::equals).count());
            assertEquals(2,service.get(name,"1.0.0").stateRevision());
        }
    }
    @Test void httpLifecycleUsesExactReferencesAndSeparatesScopes() throws Exception {
        var mvc = org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new SkillController(service))
                .setControllerAdvice(new com.lh.eap.web.controller.ApiErrorHandler()).build();
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        var preview = service.preview(input());
        String saveBody = json.writeValueAsString(Map.of("input", input(), "confirmed", true, "expectedDigest", preview.digest()));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/skills").contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(saveBody))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.enabled").value(false));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/skills"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.items[0].id").value(name))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.items[0].rawSkillMd").doesNotExist())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.items[0].scope").doesNotExist());
        String url = "/api/skills/" + name + "/versions/1.0.0";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url + "/activation").contentType(org.springframework.http.MediaType.APPLICATION_JSON).content("{\"enabled\":true,\"stateRevision\":1}"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.rawSkillMd").value(input().get("rawSkillMd")));
        var reference = Map.of("id", name, "version", "1.0.0", "digest", preview.digest(), "stateRevision", 2);
        var contextBody = Map.of("skillRef", reference, "resourcePaths", List.of());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/skills/context/preview").contentType(org.springframework.http.MediaType.APPLICATION_JSON).content(json.writeValueAsString(contextBody)))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.instructions").value("private instruction\n"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.dependencies[0].status").value("unknown"));
        var changed = new HashMap<>(reference); changed.put("digest", "0".repeat(64));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/skills/context/preview").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("skillRef", changed, "resourcePaths", List.of()))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.detail").value("SKILL_REF_STALE"));
        activate(false, 2);
        changed.put("digest",preview.digest()); changed.put("stateRevision",3);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/skills/context/preview").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("skillRef", changed, "resourcePaths", List.of()))))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.detail").value("SKILL_DISABLED"));
        var otherRoot = java.nio.file.Files.createDirectory(root.resolve("other"));
        var other = create(otherRoot);
        assertEquals("SKILL_NOT_FOUND", assertThrows(ResponseStatusException.class, () -> other.get(name,"1.0.0")).getReason());
        assertEquals("SKILL_DIGEST_MISMATCH", assertThrows(ResponseStatusException.class, () -> other.save(Map.of("input",input(),"confirmed",true,"expectedDigest",preview.digest()))).getReason());
        assertEquals("18", jdbc.queryForObject("SELECT version FROM eap.flyway_schema_history WHERE version='18' AND success",String.class));
        assertEquals("19", jdbc.queryForObject("SELECT version FROM eap.flyway_schema_history WHERE version='19' AND success",String.class));
        assertNotNull(jdbc.queryForObject("SELECT obj_description('eap.skill_version'::regclass)",String.class));
    }
    @Test void durableImmutableVersionIsIdempotentWithoutChangingTrustOrActivationAndUsesCas() {
        var preview = service.preview(input());
        assertEquals("SKILL_DIGEST_MISMATCH", assertThrows(ResponseStatusException.class, () -> save(input(), "0".repeat(64))).getReason());
        var first = save(input(), preview.digest());
        assertFalse(first.enabled()); assertEquals(1,first.stateRevision()); assertNotNull(first.trust());
        assertEquals(first, service.get(name, "1.0.0"));
        var enabled = activate(true, 1); assertEquals(2, enabled.stateRevision()); assertTrue(enabled.enabled());
        assertEquals(enabled, save(input(), preview.digest()));
        assertEquals("SKILL_STATE_STALE", assertThrows(ResponseStatusException.class, () -> activate(false, 1)).getReason());
        var changed = new HashMap<>(input()); changed.put("sourceLabel", "changed provenance");
        assertEquals("SKILL_VERSION_CONFLICT", assertThrows(ResponseStatusException.class, () -> save(changed, service.preview(changed).digest())).getReason());
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE eap.skill_version SET raw_skill_md='forged' WHERE scope=? AND id=?", ownedScope,name));
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE eap.skill_version SET enabled=false WHERE scope=? AND id=?", ownedScope,name));
        assertTrue(activate(false, 2).stateRevision() == 3);
        var reopened = create(root);
        assertEquals(3L, reopened.get(name,"1.0.0").stateRevision());
    }
}
