package com.lh.eap.ai;

import com.lh.eap.application.dto.ExpertDefinitionRequest;
import com.lh.eap.application.service.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.*;
import com.lh.eap.delivery.*;
import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.*;
import com.lh.eap.rules.*;
import com.lh.eap.runtime.handler.*;
import java.nio.file.Files;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Function;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.*;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Existing localhost DB and disposable workspace; real journal/grants/proposals/files, scripted model only. */
@EnabledIfEnvironmentVariable(named = "EAP_RUN_EXPERT_CONTINUATION_PERSISTENCE", matches = "true")
class ExpertAgentContinuationPersistenceTest extends CodeProposalPersistenceFixture {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final String expert = "continuation-fixture-" + UUID.randomUUID();
    private final List<UUID> runs = new ArrayList<>();
    private final List<SqlExpertAgentService> agents = new ArrayList<>();
    private final List<SqlExpertAgentScheduler> schedulers = new ArrayList<>();
    private final AtomicInteger parses = new AtomicInteger();
    private ExpertDefinitionService definitions;
    private ExpertAgentAccess access;
    private ExpertBehaviorCatalog policies;
    private ExpertAgentJournal journal;
    private ExpertAgentApprovalService approvals;
    private CodeChangeService changes;

    @BeforeEach void configure() {
        assertTrue(Boolean.TRUE.equals(jdbc.queryForObject("SELECT to_regclass('eap.expert_agent_run') IS NOT NULL", Boolean.class)), "Current initialization baseline must be applied by the authorized host");
        var rules = new RulePackService(jdbc);
        policies = new ExpertBehaviorCatalog(List.of(new ExpertBehaviorCatalog.Registration(SqlExpertAgentService.BINDING,
                "SQL Agent", new SqlExpertAnalysisPolicy(rules, mock(SqlExpertService.class)), "agent", SqlExpertAgentService.TOOLS,
                Set.of("sql.parse"))));
        definitions = proxy(new ExpertDefinitionService(jdbc, rules, () -> Set.of(), mock(CapabilitySettings.class), policies));
        var mapper = new ExpertDefinitionMapper(jdbc);
        var manifest = new ExpertManifest("eap/v2", "Expert", expert, "Fixture", List.of(), List.of(), List.of(), List.of(),
                List.of("database.credentials.never-expose"), List.of(), List.of(), SqlExpertAgentService.BINDING,
                new ExpertAgentDefinition("Review SQL evidence", List.of("sql.parse")));
        proxy(new ExpertManagementService(mapper, definitions, rules, mock(CapabilityCatalog.class)))
                .save(new ExpertDefinitionRequest(expert, "Fixture", ExpertManifest.serialize(manifest)));
        definitions.activate(expert, true);
        access = proxy(new WorkflowExpertAgentAccess(mapper, definitions, new TaskRepository(jdbc)));
        reconstruct();
    }
    private void reconstruct() {
        journal = proxy(new JdbcExpertAgentJournal(jdbc, new TaskRepository(jdbc), access));
        changes = service(store());
        approvals = new ExpertAgentApprovalService(changes, journal, access, jdbc, manager);
    }
    @AfterEach void removeFixtures() {
        schedulers.forEach(SqlExpertAgentScheduler::close);
        agents.forEach(SqlExpertAgentService::close);
        if (jdbc == null) return;
        for (var id : runs) {
            jdbc.update("DELETE FROM eap.task WHERE id=?", id);
            jdbc.update("DELETE FROM eap.code_proposal WHERE conversation_id=?", id);
            jdbc.update("DELETE FROM eap.code_generation WHERE conversation_id=?", id);
        }
        jdbc.update("DELETE FROM eap.expert_definition WHERE id=?", expert);
    }
    @SuppressWarnings("unchecked") private <T> T proxy(T target) {
        var factory = new ProxyFactory(target); factory.setProxyTargetClass(true);
        factory.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (T) factory.getProxy();
    }
    private UUID id() { var id = UUID.randomUUID(); runs.add(id); return id; }
    private SqlExpertAgentService agent(Function<Prompt,ChatResponse> script) {
        var parser = new SqlParseHandler() {
            @Override public NodeResult handle(CapabilityContext context) { parses.incrementAndGet(); return super.handle(context); }
        };
        var client = ChatClient.builder(FakeChatModels.scripted(prompt -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive()); return script.apply(prompt);
        })).build();
        var agent = new SqlExpertAgentService(() -> client, access, new CapabilityHandlerRegistry(List.of(parser)),
                policies, root, Duration.ofSeconds(10), journal, approvals);
        agents.add(agent); return agent;
    }
    private ChatResponse tool(String name, String field, String value) {
        return new ChatResponse(List.of(new Generation(AssistantMessage.builder().content("").toolCalls(List.of(
                new AssistantMessage.ToolCall(UUID.randomUUID().toString(), "function", name, JSON.writeValueAsString(Map.of(field, value))))).build())));
    }
    private SqlExpertAgentService.Request request(String target) {
        return new SqlExpertAgentService.Request("select 1", "Review SQL", null, null, target);
    }
    private SqlExpertAgentService.Result candidate() {
        var result = agent(p -> tool("propose_sql", "content", "select 2;\n")).execute(expert, id(), request("candidate.sql"));
        assertEquals("awaiting-approval", result.status(), result.toString()); assertNotNull(result.proposalId());
        assertFalse(Files.exists(root.resolve("candidate.sql")));
        return result;
    }
    private ExpertAgentApprovalService.Review review(UUID id, boolean approve) {
        var row = jdbc.queryForMap("SELECT proposal_id,approval_digest FROM eap.expert_agent_run WHERE task_id=?", id);
        return new ExpertAgentApprovalService.Review((UUID) row.get("proposal_id"), (String) row.get("approval_digest"), approve);
    }

    @Test void gracefulShutdownRestoresEvidenceAndChargesModelBudgetAcrossServiceReconstruction() throws Exception {
        var entered = new CountDownLatch(1);
        var first = agent(p -> {
            entered.countDown();
            try { new CountDownLatch(1).await(10, TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            return tool("finish_analysis", "summary", "Late result must not publish");
        });
        var id = id();
        try (var callers = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = callers.submit(() -> first.execute(expert, id, request(null)));
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            first.close();
            assertEquals("interrupted", pending.get(5, TimeUnit.SECONDS).status());
        }
        assertEquals(1, JSON.readTree(journal.get(expert, id).checkpoint()).path("modelCalls").asInt());
        reconstruct();
        var result = agent(p -> {
            assertTrue(p.getInstructions().toString().contains("priorObservations"));
            return tool("finish_analysis", "summary", "Restored evidence reviewed; no measured performance claim");
        }).resume(expert, id);
        assertEquals("completed", result.status(), result.toString()); assertEquals(1, parses.get());
        assertEquals(2, JSON.readTree(journal.get(expert, id).checkpoint()).path("modelCalls").asInt());
        assertEquals(2, journal.get(expert, id).attempts());
        assertEquals("completed", new TaskRepository(jdbc).findById(id).orElseThrow().get("status"));
    }
    @Test void expiredLeaseRecoversAndFencesOldWorkerAndLimitsAttempts() {
        var id = id(); journal.create(id, access.load(expert), JSON.writeValueAsString(request(null)), "Recover");
        var old = journal.claim(expert, id);
        assertThrows(ResponseStatusException.class, () -> journal.claim(expert, id));
        expireLease(id); reconstruct(); journal.recoverExpired();
        assertEquals("interrupted", journal.get(expert, id).state());
        var next = journal.claim(expert, id); assertNotEquals(old.owner(), next.owner());
        assertThrows(ResponseStatusException.class, () -> journal.checkpoint(old, "{}"));
        assertThrows(ResponseStatusException.class, () -> journal.finish(old, "completed", "{}", "skipped", List.of()));
        expireLease(id); journal.claim(expert, id); expireLease(id);
        assertThrows(ResponseStatusException.class, () -> journal.claim(expert, id));
        assertEquals(3, journal.get(expert, id).attempts());
    }
    @Test void persistedCancellationCannotResumeOrPublishLateResults() {
        var id = id(); journal.create(id, access.load(expert), JSON.writeValueAsString(request(null)), "Cancel");
        var lease = journal.claim(expert, id); assertTrue(journal.cancel(expert, id)); reconstruct();
        assertThrows(ResponseStatusException.class, () -> journal.claim(expert, id));
        assertThrows(ResponseStatusException.class, () -> journal.finish(lease, "completed", "{}", "skipped", List.of()));
        assertEquals("cancelled", journal.get(expert, id).state());
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void hardProcessExitResumesCommittedCheckpointInAnotherJvm(boolean automatic) throws Exception {
        var id = id();
        String javaExecutable = java.nio.file.Path.of(System.getProperty("java.home"), "bin",
                System.getProperty("os.name").startsWith("Windows") ? "java.exe" : "java").toString();
        var log = root.resolve("worker.log");
        var process = new ProcessBuilder(javaExecutable, "-cp", System.getProperty("surefire.test.class.path", System.getProperty("java.class.path")),
                CrashWorker.class.getName(), expert, id.toString(), root.toString(), Boolean.toString(automatic)).redirectErrorStream(true).redirectOutput(log.toFile()).start();
        try {
            assertTrue(process.waitFor(25, TimeUnit.SECONDS), "Crash fixture must stop within deadline");
            assertEquals(17, process.exitValue(), Files.readString(log));
        } finally { if (process.isAlive()) process.destroyForcibly(); }
        assertEquals("running", journal.get(expert, id).state());
        assertEquals(1, JSON.readTree(journal.get(expert, id).checkpoint()).path("modelCalls").asInt());
        expireLease(id); reconstruct();
        var resumed = agent(p -> tool("finish_analysis", "summary", "Recovered committed evidence from the exited process"));
        if (automatic) { schedule(resumed); awaitState(id, "completed"); }
        else { var result = resumed.resume(expert, id); assertEquals("completed", result.status(), result.toString()); }
        assertEquals(0, parses.get(), "The new JVM must not repeat the committed parser observation");
        assertEquals(2, JSON.readTree(journal.get(expert, id).checkpoint()).path("modelCalls").asInt());
    }
    public static class CrashWorker {
        public static void main(String[] args) throws Exception {
            var fixture = new ExpertAgentContinuationPersistenceTest();
            fixture.connect();
            var rules = new RulePackService(fixture.jdbc);
            fixture.policies = new ExpertBehaviorCatalog(List.of(new ExpertBehaviorCatalog.Registration(SqlExpertAgentService.BINDING,
                    "SQL Agent", new SqlExpertAnalysisPolicy(rules, mock(SqlExpertService.class)), "agent", SqlExpertAgentService.TOOLS,
                    Set.of("sql.parse"))));
            fixture.definitions = fixture.proxy(new ExpertDefinitionService(fixture.jdbc, rules, () -> Set.of(), mock(CapabilitySettings.class), fixture.policies));
            fixture.access = fixture.proxy(new WorkflowExpertAgentAccess(new ExpertDefinitionMapper(fixture.jdbc), fixture.definitions, new TaskRepository(fixture.jdbc)));
            fixture.root = java.nio.file.Path.of(args[2]); fixture.reconstruct();
            var service = fixture.agent(prompt -> {
                Runtime.getRuntime().halt(17); // Deliberately bypass shutdown hooks after the pre-model checkpoint commit.
                throw new AssertionError("halt returned");
            });
            if (Boolean.parseBoolean(args[3])) {
                fixture.schedule(service).enqueue(args[0], UUID.fromString(args[1]), fixture.request(null));
                new CountDownLatch(1).await(20, TimeUnit.SECONDS);
            } else service.execute(args[0], UUID.fromString(args[1]), fixture.request(null));
            throw new AssertionError("Crash point not reached");
        }
    }
    @Test void exhaustedDurableBudgetPreventsAnyModelCallAfterResume() {
        var id = id(); journal.create(id, access.load(expert), JSON.writeValueAsString(request(null)), "Budget");
        var lease = journal.claim(expert, id);
        journal.checkpoint(lease, """
                {"modelCalls":6,"facts":{},"analysis":{"parseStatus":"valid"},"advice":[],"citations":[],
                 "executed":["sql.parse"],"observations":[],"incomplete":false}
                """);
        journal.finish(lease, "interrupted", "{}", "unverified-observation", List.of()); reconstruct();
        var result = agent(p -> { fail("Restart must not refill the model budget"); return null; }).resume(expert, id);
        assertEquals("failed", result.status()); assertEquals("AGENT_CALL_LIMIT", result.error());
        assertEquals(6, JSON.readTree(journal.get(expert, id).checkpoint()).path("modelCalls").asInt());
    }
    @Test void concurrentRecoveryClaimsHaveOnlyOneOwner() throws Exception {
        var id = id(); journal.create(id, access.load(expert), JSON.writeValueAsString(request(null)), "Concurrent claim");
        var barrier = new CyclicBarrier(2);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<Boolean> claim = () -> {
                barrier.await();
                try { journal.claim(expert, id); return true; }
                catch (ResponseStatusException expected) { assertEquals("AGENT_RUN_NOT_RESUMABLE", expected.getReason()); return false; }
            };
            var first = pool.submit(claim); var second = pool.submit(claim);
            assertNotEquals(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS));
        }
        assertEquals(1, journal.get(expert, id).attempts());
    }
    @Test void restoredEvidenceRequiresLiveKnowledgeAndDatabaseGrantsBeforeModelUse() {
        for (String grantType : List.of("knowledgeGrants", "databaseGrants")) {
            var id = id(); journal.create(id, access.load(expert), JSON.writeValueAsString(request(null)), "Revoked evidence");
            var lease = journal.claim(expert, id);
            var checkpoint = JSON.readTree("""
                    {"modelCalls":1,"facts":{},"analysis":{"parseStatus":"valid"},"advice":[],"citations":[],
                     "executed":["sql.parse"],"observations":[],"incomplete":false}
                    """);
            ((tools.jackson.databind.node.ObjectNode) checkpoint).putArray(grantType).add(UUID.randomUUID().toString());
            journal.checkpoint(lease, checkpoint.toString());
            journal.finish(lease, "interrupted", "{}", "unverified-observation", List.of()); reconstruct();
            var result = agent(p -> { fail("Missing grant must block restored evidence before network I/O"); return null; }).resume(expert, id);
            assertEquals("failed", result.status()); assertEquals("AGENT_AUTHORITY_UNAVAILABLE", result.error());
        }
    }
    @Test void approvalAlsoRechecksGrantsBehindPersistedCandidateEvidence() {
        var result = candidate();
        jdbc.update("UPDATE eap.expert_agent_run SET checkpoint=checkpoint || jsonb_build_object('databaseGrants',jsonb_build_array(?::text)) WHERE task_id=?",
                UUID.randomUUID().toString(), result.id());
        reconstruct();
        assertThrows(ResponseStatusException.class, () -> approvals.review(expert, result.id(), review(result.id(), true)));
        assertEquals("awaiting-approval", journal.get(expert, result.id()).state());
        assertFalse(Files.exists(root.resolve("candidate.sql")));
    }
    @Test void immutableInputAndApprovalScopeRejectDatabaseMutation() {
        var result = candidate();
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE eap.expert_agent_run SET request='{}'::jsonb WHERE task_id=?", result.id()));
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE eap.expert_agent_run SET approval_digest='tampered' WHERE task_id=?", result.id()));
    }
    @Test void pendingApprovalSurvivesReconstructionAndApprovedReplayDoesNotWriteAgain() throws Exception {
        var result = candidate(); var approval = review(result.id(), true); reconstruct();
        assertEquals("awaiting-approval", ((ExpertAgentJournal.Entry) approvals.inspect(expert, result.id()).get("run")).state());
        approvals.review(expert, result.id(), approval);
        assertEquals("select 2;\n", Files.readString(root.resolve("candidate.sql")));
        assertEquals("applied", journal.get(expert, result.id()).state());
        assertEquals(RuntimeWorkspace.OPERATOR_LABEL, jdbc.queryForObject("SELECT decided_by FROM eap.expert_agent_run WHERE task_id=?", String.class, result.id()));
        Files.writeString(root.resolve("candidate.sql"), "later operator edit"); reconstruct();
        approvals.review(expert, result.id(), approval);
        assertEquals("later operator edit", Files.readString(root.resolve("candidate.sql")));
    }
    @Test void rejectionIsDurableAndCannotLaterBeApproved() {
        var result = candidate(); approvals.review(expert, result.id(), review(result.id(), false)); reconstruct();
        approvals.review(expert, result.id(), review(result.id(), true));
        assertEquals("denied", journal.get(expert, result.id()).state()); assertFalse(Files.exists(root.resolve("candidate.sql")));
    }
    @Test void mismatchedDigestAndRevokedExpertCannotApply() {
        var result = candidate(); var approval = review(result.id(), true);
        assertThrows(ResponseStatusException.class, () -> approvals.review(expert, result.id(), new ExpertAgentApprovalService.Review(approval.proposalId(), "wrong", true)));
        definitions.activate(expert, false);
        assertThrows(ResponseStatusException.class, () -> approvals.review(expert, result.id(), approval));
        assertEquals("awaiting-approval", journal.get(expert, result.id()).state()); assertFalse(Files.exists(root.resolve("candidate.sql")));
    }
    @Test void changedFileBaselineFailsWithoutOverwritingOperatorEdit() throws Exception {
        var result = candidate(); Files.writeString(root.resolve("candidate.sql"), "operator edit");
        assertThrows(ResponseStatusException.class, () -> approvals.review(expert, result.id(), review(result.id(), true)));
        assertEquals("operator edit", Files.readString(root.resolve("candidate.sql")));
        assertEquals("failed", journal.get(expert, result.id()).state());
    }
    @Test void interruptedWriteIntentBecomesUnknownAndCannotReplay() throws Exception {
        var result = candidate();
        jdbc.update("UPDATE eap.expert_agent_run SET state='applying',decision='approved',decided_at=now()-interval '2 minutes' WHERE task_id=?", result.id());
        assertTrue(store().claim(RuntimeWorkspace.OPERATOR_LABEL, result.id(), result.proposalId()));
        reconstruct(); changes.recoverInterruptedApplications(); approvals.recoverInterruptedApprovals();
        assertEquals("unknown", journal.get(expert, result.id()).state());
        approvals.review(expert, result.id(), review(result.id(), true));
        assertFalse(Files.exists(root.resolve("candidate.sql")));
    }
    @Test void expiredApprovalIsRecordedAndCannotWrite() {
        // Bind an already expired fixture once; the production immutable-scope trigger remains enabled.
        var id = id(); journal.create(id, access.load(expert), JSON.writeValueAsString(request("candidate.sql")), "Expired approval");
        var generation = changes.prepareGeneration(RuntimeWorkspace.OPERATOR_LABEL, id, "candidate.sql", "", "");
        var proposal = changes.proposePrepared(RuntimeWorkspace.OPERATOR_LABEL, id, generation.id(),
                "{\"files\":[{\"path\":\"candidate.sql\",\"content\":\"select 2;\"}]}", true);
        jdbc.update("UPDATE eap.expert_agent_run SET state='awaiting-approval',proposal_id=?,approval_digest='fixture',approval_expires_at=now()-interval '1 second' WHERE task_id=?", proposal.id(), id);
        approvals.review(expert, id, new ExpertAgentApprovalService.Review(proposal.id(), "fixture", true));
        assertEquals("expired", journal.get(expert, id).state()); assertFalse(Files.exists(root.resolve("candidate.sql")));
    }
    private void expireLease(UUID id) { jdbc.update("UPDATE eap.expert_agent_run SET lease_until=now()-interval '1 second' WHERE task_id=?", id); }

    private SqlExpertAgentScheduler schedule(SqlExpertAgentService service) {
        var scheduler = new SqlExpertAgentScheduler(service, journal, true, 500);
        schedulers.add(scheduler); scheduler.start(); return scheduler;
    }
    private void awaitState(UUID id, String expected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (!expected.equals(journal.get(expert, id).state()) && System.nanoTime() < deadline) Thread.sleep(30);
        assertEquals(expected, journal.get(expert, id).state());
    }
    @Test void backgroundSubmissionReturnsWhileModelIsBlockedAndTwoSchedulersDoNotDuplicateIt() throws Exception {
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1); var calls = new AtomicInteger();
        Function<Prompt,ChatResponse> script = p -> {
            calls.incrementAndGet(); entered.countDown();
            try { assertTrue(release.await(5, TimeUnit.SECONDS)); } catch (InterruptedException e) { throw new RuntimeException(e); }
            return tool("finish_analysis", "summary", "Background evidence complete");
        };
        var first = schedule(agent(script)); var second = schedule(agent(script));
        var id = id();
        try {
            var accepted = first.enqueue(expert, id, request(null));
            assertTrue(accepted.automatic());
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            for (int n = 0; n < 4; n++) { first.tick(); second.tick(); }
            assertEquals(1, calls.get()); assertEquals(1, journal.get(expert, id).attempts());
        } finally { release.countDown(); }
        awaitState(id, "completed");
        assertTrue(journal.list(100).stream().anyMatch(item -> item.id().equals(id) && item.automatic()));
    }
    @Test void gracefulBackgroundRestartAutomaticallyContinuesWithoutAnotherRequest() throws Exception {
        var entered = new CountDownLatch(1);
        var first = schedule(agent(p -> {
            entered.countDown();
            try { new CountDownLatch(1).await(); } catch (InterruptedException expected) { Thread.currentThread().interrupt(); }
            return tool("finish_analysis", "summary", "Late output");
        }));
        var id = id(); first.enqueue(expert, id, request(null)); assertTrue(entered.await(5, TimeUnit.SECONDS));
        first.close(); awaitState(id, "interrupted"); reconstruct();
        schedule(agent(p -> tool("finish_analysis", "summary", "Automatically resumed")));
        awaitState(id, "completed"); assertEquals(1, parses.get()); assertEquals(2, journal.get(expert, id).attempts());
    }
    @Test void schedulingConsentIsImmutableAndHistoricalManualRunsAreNotClaimed() throws Exception {
        var manual = id(); journal.create(manual, access.load(expert), JSON.writeValueAsString(request(null)), "Manual");
        var scheduler = schedule(agent(p -> tool("finish_analysis", "summary", "Automatic")));
        var automatic = id(); scheduler.enqueue(expert, automatic, request(null)); awaitState(automatic, "completed");
        assertEquals("queued", journal.get(expert, manual).state());
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update("UPDATE eap.expert_agent_run SET automatic=true WHERE task_id=?", manual));
        assertEquals(1, parses.get());
    }
    @Test void duplicateQueueSubmissionReusesIdButCannotReplaceInputOrRepeatCompletedWork() throws Exception {
        var scheduler = schedule(agent(p -> tool("finish_analysis", "summary", "Done")));
        var id = id(); scheduler.enqueue(expert, id, request(null)); scheduler.enqueue(expert, id, request(null));
        assertThrows(ResponseStatusException.class, () -> scheduler.enqueue(expert, id,
                new SqlExpertAgentService.Request("select 2", "different", null, null)));
        awaitState(id, "completed"); scheduler.enqueue(expert, id, request(null));
        assertEquals(1, journal.get(expert, id).attempts()); assertEquals(1, parses.get());
    }
    @Test void revokedQueuedExpertFailsDurablyInsteadOfBlockingDispatchForever() throws Exception {
        var service = agent(p -> { fail("Revoked queue item must not reach model"); return null; });
        var id = id(); service.enqueue(expert, id, request(null)); definitions.activate(expert, false);
        schedule(service); awaitState(id, "failed"); assertEquals(0, parses.get());
    }
    @Test void automaticQueueStopsAtApprovalAndDoesNotWriteOrConsumeMoreAttempts() throws Exception {
        var scheduler = schedule(agent(p -> tool("propose_sql", "content", "select 2;")));
        var id = id(); scheduler.enqueue(expert, id, request("candidate.sql")); awaitState(id, "awaiting-approval");
        scheduler.tick(); scheduler.tick();
        assertFalse(Files.exists(root.resolve("candidate.sql"))); assertEquals(1, journal.get(expert, id).attempts());
        assertTrue(journal.cancel(expert, id)); scheduler.tick(); assertEquals("cancelled", journal.get(expert, id).state());
    }
    @Test void queueAdmissionIsBoundedAndCancellationReleasesCapacity() {
        var snapshot = access.load(expert); var input = JSON.writeValueAsString(request(null));
        for (int index = 0; index < 100; index++) journal.enqueue(id(), snapshot, input, "Capacity fixture");
        var rejected = id();
        assertEquals(429, assertThrows(ResponseStatusException.class, () -> journal.enqueue(rejected, snapshot, input, "Full")).getStatusCode().value());
        assertFalse(Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM eap.task WHERE id=?)", Boolean.class, rejected)));
        assertTrue(journal.cancel(expert, runs.getFirst()));
        assertEquals("queued", journal.enqueue(rejected, snapshot, input, "Now available").state());
    }
}
