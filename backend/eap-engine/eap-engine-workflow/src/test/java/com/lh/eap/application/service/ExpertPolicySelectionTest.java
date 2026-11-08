package com.lh.eap.application.service;

import com.lh.eap.core.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.TaskRepository;
import com.lh.eap.runtime.handler.*;
import java.nio.file.Path;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ExpertPolicySelectionTest {
    private final ExpertDefinitionService definitions = mock(ExpertDefinitionService.class);
    private final TaskRepository tasks = mock(TaskRepository.class);
    private final ExecutionResource resource = mock(ExecutionResource.class);
    private final ExecutionResource.Scope scope = mock(ExecutionResource.Scope.class);

    @Test void persistedBindingControlsExecutionAndObservationAuditRegardlessOfExpertId() {
        var binding = new ExpertBehaviorBinding("local-review", 2);
        var selected = policy("second");
        var resolver = new ExpertBehaviorCatalog(List.of(
                new ExpertBehaviorCatalog.Registration(binding, "Local", selected)), binding);
        var service = service(resolver, context -> {
            context.publish("second.checked", true);
            return new NodeResult(true, false, "Checked", Map.of());
        });
        var stored = manifest("first");
        var bound = new ExpertManifest(stored.apiVersion(), stored.kind(), stored.id(), stored.name(),
                stored.knowledgeBases(), stored.databaseProfiles(), stored.steps(), stored.edges(), stored.rules(),
                stored.rulePacks(), stored.mcpTools(), binding);
        when(definitions.require("first", true)).thenReturn(ExpertManifest.parse(ExpertManifest.serialize(bound)));
        var result = service.execute("first", request());
        assertDomain(result, "second");
        assertEquals(Map.of("id", "local-review", "version", 2), result.get("behavior"));
        verify(tasks).save(any(), anyString(), eq("completed"), anyString(), anyString(), argThat(observations ->
                observations.stream().allMatch(observation -> result.get("behavior").equals(observation.metadata().get("behavior")))));
    }

    @Test void missingPersistedVersionDoesNotFallBackToInstalledLegacyPolicy() {
        var binding = new ExpertBehaviorBinding("local-review", 1);
        var installed = policy("first");
        var resolver = new ExpertBehaviorCatalog(List.of(
                new ExpertBehaviorCatalog.Registration(binding, "Local", installed)), binding);
        var service = service(resolver, context -> { fail("Tool must not run"); return null; });
        var stored = manifest("first");
        var bound = new ExpertManifest(stored.apiVersion(), stored.kind(), stored.id(), stored.name(),
                stored.knowledgeBases(), stored.databaseProfiles(), stored.steps(), stored.edges(), stored.rules(),
                stored.rulePacks(), stored.mcpTools(), new ExpertBehaviorBinding("local-review", 2));
        when(definitions.require("first", true)).thenReturn(bound);
        assertEquals(503, assertThrows(ResponseStatusException.class, () -> service.execute("first", request())).getStatusCode().value());
        verifyNoInteractions(resource, tasks, installed);
    }

    @Test void sameServiceSelectsEachExpertsDomainForAllAnalysisStages() {
        var first = policy("first");
        var second = policy("second");
        var resolver = mock(ExpertAnalysisPolicyResolver.class);
        when(resolver.resolve(manifest("first"))).thenReturn(Optional.of(first));
        when(resolver.resolve(manifest("second"))).thenReturn(Optional.of(second));
        var service = service(resolver, this::publish);
        assertDomain(service.execute("first", request()), "first");
        assertDomain(service.execute("second", request()), "second");
        for (var domain : List.of("first", "second")) {
            var selected = domain.equals("first") ? first : second;
            verify(resolver).resolve(manifest(domain));
            verify(selected).rules(List.of());
            verify(selected).judge(anyMap(), eq(List.of()), eq(Set.of("local.inspect")));
            verify(selected).summarize(List.of());
            verify(selected).enhance(any(), eq(false), eq(false));
        }
    }

    @Test void unsupportedExpertRejectsBeforeResourcesToolsOrTaskWrites() {
        var resolver = mock(ExpertAnalysisPolicyResolver.class);
        when(resolver.resolve(any())).thenReturn(Optional.empty());
        var service = service(resolver, context -> { fail("Tool must not run"); return null; });
        var error = assertThrows(ResponseStatusException.class, () -> service.execute("first", request()));
        assertEquals(503, error.getStatusCode().value());
        assertEquals("EXPERT_ANALYSIS_POLICY_UNAVAILABLE", error.getReason());
        verifyNoInteractions(resource, tasks);
        when(resolver.resolve(any())).thenReturn(null);
        assertThrows(ResponseStatusException.class, () -> service.execute("first", request()));
        verifyNoInteractions(resource, tasks);
    }

    @Test void selectedPolicyAndFactVocabularyStayFixedUntilTheRunEnds() {
        var first = policy("first");
        var second = policy("second");
        var facts = new HashSet<>(Set.of("first.checked"));
        when(first.allowedFacts()).thenReturn(facts);
        var selected = new AtomicReference<ExpertAnalysisPolicy>(first);
        var resolver = mock(ExpertAnalysisPolicyResolver.class);
        when(resolver.resolve(any())).thenAnswer(call -> Optional.of(selected.get()));
        var service = service(resolver, context -> {
            selected.set(second);
            facts.clear();
            facts.add("second.checked");
            return publish(context);
        });
        assertDomain(service.execute("first", request()), "first");
        verify(resolver).resolve(manifest("first"));
        verify(first).allowedFacts();
        verifyNoInteractions(second);
    }

    @Test void simultaneousExpertsDoNotOverwriteEachOthersSelectedPolicy() throws Exception {
        var first = policy("first");
        var second = policy("second");
        var barrier = new CyclicBarrier(2);
        ExpertAnalysisPolicyResolver resolver = expert -> Optional.of(expert.id().equals("first") ? first : second);
        var service = service(resolver, context -> {
            try { barrier.await(5, TimeUnit.SECONDS); }
            catch (Exception failure) { throw new IllegalStateException(failure); }
            return publish(context);
        });
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = executor.submit(() -> service.execute("first", request()));
            var b = executor.submit(() -> service.execute("second", request()));
            assertDomain(a.get(10, TimeUnit.SECONDS), "first");
            assertDomain(b.get(10, TimeUnit.SECONDS), "second");
        }
    }

    @Test void policyResolutionFailureDoesNotOpenExecutionResources() {
        var failure = new IllegalStateException("Policy store unavailable");
        ExpertAnalysisPolicyResolver resolver = expert -> { throw failure; };
        var service = service(resolver, context -> { fail("Tool must not run"); return null; });
        assertSame(failure, assertThrows(IllegalStateException.class, () -> service.execute("first", request())));
        verifyNoInteractions(resource, tasks);
    }

    private ExpertExecutionService service(ExpertAnalysisPolicyResolver resolver, Function<CapabilityContext, NodeResult> action) {
        when(definitions.require(anyString(), eq(true))).thenAnswer(call -> manifest(call.getArgument(0)));
        when(definitions.knowledgeGrants(anyString())).thenReturn(List.of());
        when(resource.open(any(), anyString())).thenReturn(scope);
        CapabilityHandler handler = new CapabilityHandler() {
            public Set<String> capabilities() { return Set.of("local.inspect"); }
            public NodeResult handle(CapabilityContext context) { return action.apply(context); }
        };
        return new ExpertExecutionService(definitions, tasks, new CapabilityHandlerRegistry(List.of(handler)),
                resolver, Path.of("."), List.of(resource));
    }

    private NodeResult publish(CapabilityContext context) {
        context.publish(context.expertId() + ".checked", true);
        return new NodeResult(true, false, "Checked", Map.of());
    }

    private static ExpertAnalysisPolicy policy(String id) {
        var policy = mock(ExpertAnalysisPolicy.class);
        when(policy.rules(List.of())).thenReturn(new ExpertAnalysisPolicy.Rules(List.of(), List.of()));
        when(policy.allowedFacts()).thenReturn(Set.of(id + ".checked"));
        when(policy.judge(anyMap(), anyList(), anySet())).thenReturn(Map.of("domain", id, "ruleCapabilities", Map.of()));
        when(policy.summarize(anyList())).thenReturn(List.of());
        when(policy.enhance(any(), anyBoolean(), anyBoolean()))
                .thenReturn(new ExpertAnalysisPolicy.Enhancement(null, "skipped", Map.of("domain", id)));
        return policy;
    }

    private static ExpertManifest manifest(String id) {
        return new ExpertManifest("eap/v1", "Expert", id, id, List.of(), List.of(),
                List.of(new ExpertManifest.Step("inspect", "Inspect", "local.inspect", true)), List.of(),
                List.of("database.credentials.never-expose"));
    }

    private static ExpertExecutionService.Request request() {
        return new ExpertExecutionService.Request(null, "Inspect", null, null, false, null);
    }

    private static void assertDomain(Map<String, Object> result, String id) {
        assertEquals("completed", result.get("status"));
        var analysis = (Map<?, ?>) result.get("deterministicAnalysis");
        assertEquals(id, analysis.get("domain"));
        assertEquals(Map.of(id + ".checked", true), analysis.get("facts"));
        assertEquals(Map.of("domain", id), result.get("modelAdvisor"));
    }
}
