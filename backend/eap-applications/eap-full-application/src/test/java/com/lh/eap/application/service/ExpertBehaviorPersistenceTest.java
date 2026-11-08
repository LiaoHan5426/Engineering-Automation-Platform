package com.lh.eap.application.service;

import com.lh.eap.application.dto.ExpertDefinitionRequest;
import com.lh.eap.core.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.ExpertDefinitionMapper;
import com.lh.eap.persistence.mapper.TaskRepository;
import com.lh.eap.runtime.handler.*;
import java.nio.file.Path;
import com.lh.eap.rules.RulePackQuery;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Existing local schema only: committed random expert fixtures, no DDL/reset/model/tool calls.
 * Every test removes only its own expert and cascading grants. Enable this gate separately. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_EXPERT_BEHAVIOR_PERSISTENCE", matches = "true")
class ExpertBehaviorPersistenceTest {
    private final String id = "behavior-fixture-" + UUID.randomUUID();
    private final ExpertBehaviorBinding v1 = new ExpertBehaviorBinding("sql-analysis", 1);
    private final ExpertBehaviorBinding v2 = new ExpertBehaviorBinding("local-review", 2);
    private final ExpertAnalysisPolicy first = mock(ExpertAnalysisPolicy.class);
    private final ExpertAnalysisPolicy second = mock(ExpertAnalysisPolicy.class);
    private JdbcTemplate jdbc;
    private DataSourceTransactionManager transactions;
    private ExpertBehaviorCatalog policies;
    private ExpertDefinitionMapper mapper;
    private ExpertDefinitionService definitions;
    private ExpertManagementService management;
    private final List<UUID> taskIds = new ArrayList<>();

    @BeforeEach void connect() throws Exception {
        var env = new StandardEnvironment();
        for (var source : new YamlPropertySourceLoader().load("application", new ClassPathResource("application.yml"))) {
            env.getPropertySources().addLast(source);
        }
        String url = env.getProperty("spring.datasource.url");
        assertNotNull(url);
        assertTrue(url.startsWith("jdbc:postgresql://localhost:") || url.startsWith("jdbc:postgresql://127.0.0.1:"));
        var dataSource = new DriverManagerDataSource(url, env.getProperty("spring.datasource.username"), env.getProperty("spring.datasource.password"));
        jdbc = new JdbcTemplate(dataSource);
        transactions = new DataSourceTransactionManager(dataSource);
        policies = new ExpertBehaviorCatalog(List.of(
                new ExpertBehaviorCatalog.Registration(v1, "SQL", first),
                new ExpertBehaviorCatalog.Registration(v2, "Local", second)), v1);
        mapper = new ExpertDefinitionMapper(jdbc);
        definitions = definitions(policies);
        management = management(mapper, definitions);
        for (var policy : List.of(first, second)) {
            when(policy.allowedFacts()).thenReturn(Set.of("behavior.checked"));
            when(policy.rules(anyList())).thenReturn(new ExpertAnalysisPolicy.Rules(List.of(), List.of()));
            when(policy.judge(anyMap(), anyList(), anySet())).thenReturn(Map.of("selected", policy == first ? "first" : "second", "ruleCapabilities", Map.of()));
            when(policy.summarize(anyList())).thenReturn(List.of());
            when(policy.enhance(any(), anyBoolean(), anyBoolean())).thenReturn(new ExpertAnalysisPolicy.Enhancement(null, "skipped", Map.of()));
        }
    }

    @AfterEach void cleanOwnedFixture() {
        if (jdbc != null) {
            for (var taskId : taskIds) jdbc.update("DELETE FROM eap.task WHERE id=?", taskId);
            jdbc.update("DELETE FROM eap.expert_definition WHERE id=?", id);
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM eap.expert_definition WHERE id=?", Integer.class, id));
        }
    }

    @Test void committedBindingSurvivesNewServicesAndUpdatesRevokeAuthorizationUntilReactivation() {
        assertEquals(v1, management.save(request(null)).get("behavior"));
        // Each JdbcTemplate call obtains a fresh connection; these are committed DB reads, not an in-memory map.
        var reloaded = definitions(policies);
        assertEquals(v1, reloaded.require(id, false).behavior());
        assertSame(first, policies.resolve(reloaded.require(id, false)).orElseThrow());
        definitions.activate(id, true);
        jdbc.update("INSERT INTO eap.expert_mcp_grant(expert_id,capability) VALUES (?,?)", id, "fixture.inspect");
        int revision = revision();
        assertEquals(v2, management.save(request(v2)).get("behavior"));
        assertEquals(revision + 1, revision());
        assertEquals(0, grants());
        assertThrows(ResponseStatusException.class, () -> reloaded.require(id, true));
        assertSame(second, policies.resolve(reloaded.require(id, false)).orElseThrow());
        reloaded.activate(id, true);
        assertEquals(v2, reloaded.require(id, true).behavior());
        CapabilityHandler localFixture = new CapabilityHandler() {
            public Set<String> capabilities() { return Set.of("git-status"); }
            public NodeResult handle(CapabilityContext context) {
                context.publish("behavior.checked", true);
                return new NodeResult(true, false, "Fixture evidence", Map.of());
            }
        };
        var tasks = new TaskRepository(jdbc);
        var executor = proxy(new ExpertExecutionService(reloaded, tasks,
                new CapabilityHandlerRegistry(List.of(localFixture)), policies, Path.of("."), List.of()));
        var result = executor.execute(id, new ExpertExecutionService.Request(null, "Fixture", null, null, false, null));
        var taskId = (UUID) result.get("id");
        taskIds.add(taskId);
        assertEquals("second", ((Map<?, ?>) result.get("deterministicAnalysis")).get("selected"));
        assertEquals(Map.of("id", v2.id(), "version", v2.version()), result.get("behavior"));
        management.save(request(v1));
        var history = new TaskRepository(jdbc).findById(taskId).orElseThrow();
        var observations = (List<?>) history.get("observations");
        var metadata = (Map<?, ?>) ((Map<?, ?>) observations.getFirst()).get("metadata");
        assertEquals(result.get("behavior"), metadata.get("behavior"), "History must retain the executed version after the expert changes");
    }

    @Test void legacyEditorCannotEraseSavedVersionAndUnknownOrNullBindingCannotChangeIt() {
        management.save(request(v2));
        management.save(request(null));
        assertEquals(v2, definitions.require(id, false).behavior());
        assertTrue(mapper.findManifest(id).orElseThrow().contains("layout-marker"));
        int revision = revision();
        assertThrows(ResponseStatusException.class, () -> management.save(request(new ExpertBehaviorBinding("local-review", 999))));
        var invalid = request(null).manifest().replace("\"extension\"", "\"behavior\":null,\"extension\"");
        assertThrows(ResponseStatusException.class, () -> management.save(new ExpertDefinitionRequest(id, "Fixture", invalid)));
        assertEquals(revision, revision());
        assertEquals(v2, definitions.require(id, false).behavior());
    }

    @Test void providerRemovalDeniesActivationButAllowsRevocation() {
        management.save(request(v2));
        definitions.activate(id, true);
        var restricted = definitions(onlyFirst());
        assertThrows(ResponseStatusException.class, () -> restricted.activate(id, true));
        restricted.activate(id, false);
        assertThrows(ResponseStatusException.class, () -> restricted.require(id, true));
        assertEquals(v2, restricted.require(id, false).behavior());
    }

    @Test void staleValidationCannotOverwriteNewBindingAndFailureRollsBackDraftAndGrantDeletes() {
        management.save(request(v2));
        definitions.activate(id, true);
        jdbc.update("INSERT INTO eap.expert_mcp_grant(expert_id,capability) VALUES (?,?)", id, "fixture.inspect");
        int revision = revision();
        // Deterministically reproduce a stale pre-upsert read; PostgreSQL must preserve the actual row's v2.
        var staleReader = new ExpertDefinitionMapper(jdbc) {
            @Override public Optional<String> findManifest(String expertId) { return Optional.of(request(v1).manifest()); }
        };
        var restricted = management(staleReader, definitions(onlyFirst()));
        assertThrows(ResponseStatusException.class, () -> restricted.save(request(null)));
        assertEquals(revision, revision());
        assertEquals(1, grants());
        assertEquals(v2, definitions.require(id, true).behavior());
    }

    private ExpertBehaviorCatalog onlyFirst() {
        return new ExpertBehaviorCatalog(List.of(new ExpertBehaviorCatalog.Registration(v1, "SQL", first)), v1);
    }
    private ExpertDefinitionService definitions(ExpertAnalysisPolicyResolver resolver) {
        return proxy(new ExpertDefinitionService(jdbc, mock(RulePackQuery.class), () -> Set.of(),
                mock(CapabilitySettings.class), resolver));
    }
    private ExpertManagementService management(ExpertDefinitionMapper store, ExpertDefinitionService experts) {
        return proxy(new ExpertManagementService(store, experts, mock(RulePackQuery.class), mock(CapabilityCatalog.class)));
    }
    @SuppressWarnings("unchecked") private <T> T proxy(T target) {
        var factory = new ProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(transactions, new AnnotationTransactionAttributeSource()));
        return (T) factory.getProxy();
    }
    private int revision() { return jdbc.queryForObject("SELECT revision FROM eap.expert_definition WHERE id=?", Integer.class, id); }
    private int grants() { return jdbc.queryForObject("SELECT count(*) FROM eap.expert_mcp_grant WHERE expert_id=?", Integer.class, id); }
    private ExpertDefinitionRequest request(ExpertBehaviorBinding binding) {
        var manifest = new ExpertManifest("eap/v1", "Expert", id, "Fixture", List.of(), List.of(),
                List.of(new ExpertManifest.Step("inspect", "Inspect", "git-status", true)), List.of(),
                List.of("database.credentials.never-expose"), List.of(), List.of(), binding);
        var raw = ExpertManifest.serialize(manifest);
        raw = raw.substring(0, raw.length() - 1) + ",\"extension\":\"layout-marker\"}";
        return new ExpertDefinitionRequest(id, "Fixture", raw);
    }
}
