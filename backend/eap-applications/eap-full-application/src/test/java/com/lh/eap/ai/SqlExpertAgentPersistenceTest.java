package com.lh.eap.ai;

import com.lh.eap.application.dto.ExpertDefinitionRequest;
import com.lh.eap.application.service.*;
import com.lh.eap.core.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.*;
import com.lh.eap.rules.*;
import com.lh.eap.runtime.handler.*;
import java.nio.file.Path;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.*;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Existing localhost DB, random fixtures only, real parser/metadata/plan/Task stores; Fake model, no SQL execution or DDL. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_EXPERT_AGENT_PERSISTENCE", matches = "true")
class SqlExpertAgentPersistenceTest {
    private final String expert = "agent-fixture-" + UUID.randomUUID();
    private final UUID profile = UUID.randomUUID();
    private final List<UUID> tasks = new ArrayList<>();
    private final List<SqlExpertAgentService> services = new ArrayList<>();
    private JdbcTemplate jdbc;
    private DataSourceTransactionManager transactions;
    private ExpertDefinitionService definitions;
    private ExpertBehaviorCatalog policies;
    private ExpertDefinitionMapper mapper;
    private final AtomicInteger turns = new AtomicInteger();

    @BeforeEach void setup() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) env.getPropertySources().addLast(source);
        String url = env.getProperty("spring.datasource.url");
        assertNotNull(url);
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"));
        var ds = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(ds); transactions = new DataSourceTransactionManager(ds);
        var rules = new RulePackService(jdbc);
        var policy = new SqlExpertAnalysisPolicy(rules, mock(SqlExpertService.class));
        policies = new ExpertBehaviorCatalog(List.of(new ExpertBehaviorCatalog.Registration(SqlExpertAgentService.BINDING,
                "SQL Agent", policy, "agent", SqlExpertAgentService.TOOLS, Set.of("sql.parse"))), SqlExpertAgentService.BINDING);
        mapper = new ExpertDefinitionMapper(jdbc);
        definitions = proxy(new ExpertDefinitionService(jdbc, rules, () -> Set.of(), mock(CapabilitySettings.class), policies));
        jdbc.update("INSERT INTO eap.database_profile(id,label,engine,environment,metadata) VALUES (?,'agent fixture','PostgreSQL','local',?::jsonb)",
                profile, "{\"tables\":[{\"name\":\"orders\",\"columns\":[{\"name\":\"id\",\"type\":\"int\"}]}],\"indexes\":[]}");
        var manifest = new ExpertManifest("eap/v2", "Expert", expert, "Fixture", List.of(), List.of(profile.toString()),
                List.of(), List.of(), List.of("database.credentials.never-expose"), List.of(), List.of(), SqlExpertAgentService.BINDING,
                new ExpertAgentDefinition("Diagnose from authorized evidence", List.of("sql.parse", "database.schema.read", "database.explain")));
        var management = proxy(new ExpertManagementService(mapper, definitions, rules, mock(CapabilityCatalog.class)));
        management.save(new ExpertDefinitionRequest(expert, "Fixture", ExpertManifest.serialize(manifest)));
        definitions.activate(expert, true);
    }
    @AfterEach void cleanup() {
        services.forEach(SqlExpertAgentService::close);
        if (jdbc != null) {
            for (var task : tasks) jdbc.update("DELETE FROM eap.task WHERE id=?", task);
            jdbc.update("DELETE FROM eap.expert_definition WHERE id=?", expert);
            jdbc.update("DELETE FROM eap.database_profile WHERE id=?", profile);
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.expert_definition WHERE id=?", Integer.class, expert));
        }
    }
    @SuppressWarnings("unchecked") private <T> T proxy(T target) {
        var factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        return (T) factory.getProxy();
    }
    private SqlExpertAgentService service(Function<Prompt,ChatResponse> script) {
        var parser = new SqlParseHandler() {
            @Override public NodeResult handle(CapabilityContext context) {
                assertTrue(TransactionSynchronizationManager.isActualTransactionActive(), "Local read must share the expert lock transaction");
                return super.handle(context);
            }
        };
        var handlers = new CapabilityHandlerRegistry(List.of(parser, new DatabaseExplainHandler(), new DatabaseMetadataHandler(jdbc, definitions)));
        var access = proxy(new WorkflowExpertAgentAccess(mapper, definitions, new TaskRepository(jdbc)));
        var client = ChatClient.builder(FakeChatModels.scripted(prompt -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive(), "Model cannot run in a database transaction");
            turns.incrementAndGet(); return script.apply(prompt);
        })).build();
        var service = new SqlExpertAgentService(() -> client, access, handlers, policies, Path.of("."), Duration.ofSeconds(8));
        services.add(service); return service;
    }
    private SqlExpertAgentService.Result run(SqlExpertAgentService service) {
        var id = UUID.randomUUID(); tasks.add(id);
        return service.execute(expert, id, new SqlExpertAgentService.Request("select id from orders", "Inspect the evidence", profile,
                Map.of("Plan", Map.of("Node Type", "Seq Scan", "Relation Name", "orders", "Plan Rows", 10))));
    }
    private ChatResponse tool(String name, String arguments) {
        return new ChatResponse(List.of(new Generation(AssistantMessage.builder().content("")
                .toolCalls(List.of(new AssistantMessage.ToolCall("call-" + turns.get(), "function", name, arguments))).build())));
    }
    @Test void modelChoosesEvidenceThenRequestsMoreAndTaskHistorySurvivesServiceReconstruction() {
        var result = run(service(prompt -> {
            if (turns.get() == 1) return tool("read_evidence", "{\"capability\":\"database.schema.read\"}");
            assertTrue(prompt.getInstructions().toString().contains("orders"));
            return tool("request_input", "{\"question\":\"Please provide measured row counts before making performance claims\"}");
        }));
        assertEquals("needs-input", result.status(), result.toString());
        var stored = new TaskRepository(jdbc).findById(result.id()).orElseThrow();
        assertEquals("needs-input", stored.get("status")); assertEquals("needs-review", stored.get("decision"));
        assertEquals(3, ((List<?>) stored.get("observations")).size());
        var access = proxy(new WorkflowExpertAgentAccess(new ExpertDefinitionMapper(jdbc), definitions, new TaskRepository(jdbc)));
        assertEquals(SqlExpertAgentService.BINDING, access.load(expert).manifest().behavior());
        var replay = service(prompt -> { fail("A persisted execution id cannot call the model twice"); return null; });
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> replay.execute(expert, result.id(),
                new SqlExpertAgentService.Request("select 1", "Retry", null, null)));
    }
    @Test void persistedRevocationDuringModelCallBlocksReturnedToolAndEndsTask() {
        var result = run(service(prompt -> {
            definitions.activate(expert, false); // Separate short transaction while the model owns no lock.
            return tool("read_evidence", "{\"capability\":\"database.schema.read\"}");
        }));
        assertEquals("failed", result.status()); assertEquals("AGENT_AUTHORITY_UNAVAILABLE", result.error());
        assertEquals(1, turns.get());
        assertEquals(List.of("sql.parse", "expert.agent"), result.observations().stream().map(o -> o.capability()).toList());
        assertEquals("failed", new TaskRepository(jdbc).findById(result.id()).orElseThrow().get("status"));
    }
    @Test void deletedDatabaseGrantCannotBeReplacedByManifestDeclarationOrModelClaim() {
        var result = run(service(prompt -> {
            if (turns.get() == 1) {
                jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?", expert);
                return tool("read_evidence", "{\"capability\":\"database.schema.read\"}");
            }
            var toolData = prompt.getInstructions().stream().filter(ToolResponseMessage.class::isInstance).map(Object::toString).toList().toString();
            assertFalse(toolData.contains("\"columns\""));
            return tool("finish_analysis", "{\"summary\":\"No authorized schema evidence is available\"}");
        }));
        assertEquals("partial", result.status(), result.toString());
        assertEquals("unverified", result.verification());
    }
    @Test void revokingAlreadyCapturedMetadataBlocksItsReuseByTheNextModelDecision() {
        var result = run(service(prompt -> {
            if (turns.get() == 1) return tool("read_evidence", "{\"capability\":\"database.schema.read\"}");
            jdbc.update("DELETE FROM eap.expert_database_grant WHERE expert_id=?", expert);
            return tool("finish_analysis", "{\"summary\":\"Do not accept conclusions after the evidence grant is revoked\"}");
        }));
        assertEquals("failed", result.status()); assertEquals("AGENT_AUTHORITY_UNAVAILABLE", result.error());
        assertEquals(2, turns.get()); assertEquals("", result.summary());
    }
}
