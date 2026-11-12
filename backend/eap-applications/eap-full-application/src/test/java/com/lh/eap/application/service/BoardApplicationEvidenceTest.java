package com.lh.eap.application.service;
import com.lh.eap.delivery.CodeProposalStore;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.CodeGenerationStore;

import com.lh.eap.ai.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BoardApplicationEvidenceTest {
    private final CodeProposalStore proposals = mock(CodeProposalStore.class);
    private final CodeGenerationStore generations = mock(CodeGenerationStore.class);
    private final UUID conversation = UUID.randomUUID(), id = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-11-01T00:00:00Z");
    private CodeGenerationStore.Snapshot generation = new CodeGenerationStore.Snapshot(UUID.randomUUID(), AiConversationRegistry.PRINCIPAL, conversation, "repo", "frontend/source.ts", GitReviewCapture.hash("before"), "before", "", "", now);
    private CodeChangeService.Proposal proposal = new CodeChangeService.Proposal(id, conversation, "repo", "candidate", List.of(new CodeChangeService.Change(generation.targetPath(), "before", "after", generation.baseHash())), now, false, true, "not_requested", generation.reference());
    private CodeChangeService.Applied applied = new CodeChangeService.Applied(id, List.of(generation.targetPath()), "not_requested", List.of(), "APPLIED", GitReviewCapture.hash("after"), "");
    private BoardVerificationSource.Source source = new BoardVerificationSource.Source("frontend", "source", List.of(new BoardVerificationSource.File(generation.targetPath(), applied.afterHash(), 5)), List.of());
    private List<BoardDeliveryCapture.File> files = List.of(new BoardDeliveryCapture.File(generation.targetPath(), generation.baseHash(), applied.afterHash(), "before", "after"));
    private BoardPrototypeService.Reference prototype;
    private com.lh.eap.api.TaskRef target;
    private BoardRunService.Snapshot runTask;
    private String principal = AiConversationRegistry.PRINCIPAL, status = "APPLIED";
    private Instant finished = now.plusSeconds(1), started = now;
    private final BoardApplicationBaseline baselines=mock(BoardApplicationBaseline.class);
    private final BoardApplicationEvidence service = new BoardApplicationEvidence(proposals, generations, baselines);
    private BoardApplicationEvidence.Evidence associate() {
        when(baselines.required(anyString(),any(),any(),anyString())).thenReturn(new BoardApplicationBaseline.Baseline("repo","base",source,now));
        when(proposals.find(AiConversationRegistry.PRINCIPAL, conversation, id)).thenReturn(Optional.of(new CodeProposalStore.Stored(principal, proposal, status, applied, "", started, finished)));
        when(generations.find(any())).thenReturn(Optional.of(generation));
        var plan = new BoardVerificationPlanSupport.Plan("plan", "repo", "base", source, List.of());
        var verification = new BoardVerificationService.Record(UUID.randomUUID(), "PASSED", "", plan, List.of(), source, now.plusSeconds(2), now.plusSeconds(3));
        return service.associate(new BoardDeliveryService.ApplicationRef(conversation, id), "repo", prototype, verification, files, now.plusSeconds(4), target, runTask);
    }
    @Test void persistentAppliedEvidenceCanBeAssociatedWithoutLiveConversation() {
        var evidence = associate();
        assertEquals("POST_HOC", evidence.association()); assertEquals(generation.id(), evidence.generationId());
        assertEquals(applied.afterHash(), evidence.appliedAfterHash()); assertNull(evidence.prototypeVersionId());
        assertEquals("local-operator", evidence.operator());
        verify(proposals).find(AiConversationRegistry.PRINCIPAL, conversation, id); verifyNoMoreInteractions(proposals);
    }
    @Test void matchingPrototypeAndEqualVerificationBoundaryAreAllowed() {
        var version=UUID.randomUUID(); var hash="a".repeat(64);
        prototype=new BoardPrototypeService.Reference(version,"builder","test",hash,now);
        generation=new CodeGenerationStore.Snapshot(generation.id(),principal,conversation,"repo",generation.targetPath(),generation.baseHash(),generation.source(),version.toString(),hash,now);
        proposal=new CodeChangeService.Proposal(id,conversation,"repo","",proposal.files(),now,false,true,"",generation.reference());
        finished=now.plusSeconds(2);
        var evidence=associate(); assertEquals(version.toString(),evidence.prototypeVersionId()); assertEquals(hash,evidence.prototypeContentHash());
    }
    @Test void preboundAssociationRetainsOriginalSummaryAndDoesNotClaimRunAuthorship() {
        bindTask();
        var evidence = associate();
        assertEquals("PREBOUND", evidence.association()); assertEquals(target, evidence.taskBinding());
        assertEquals(generation.reference().taskBinding(), evidence.taskBinding());
    }
    private void bindTask() {
        var task = new CodeGenerationStore.TaskSnapshot("project", UUID.randomUUID(), 3, "title", "goal", "criteria", "reviewed plan", null);
        target = task.binding(); runTask = new BoardRunService.Snapshot("title", "goal", "criteria", null);
        generation = new CodeGenerationStore.Snapshot(generation.id(), principal, conversation, "repo", generation.targetPath(), generation.baseHash(), generation.source(), "", "", now, task);
        proposal = new CodeChangeService.Proposal(id, conversation, "repo", "candidate", proposal.files(), now, false, true, "not_requested", generation.reference());
    }
    @ParameterizedTest @ValueSource(strings={"project", "task", "revision", "missingTarget", "missingRun", "title", "goal", "criteria", "prototype"})
    void preboundMismatchIsRejectedInsteadOfDowngradedToPostHoc(String mutation) {
        bindTask();
        target = mutation.equals("missingTarget") ? null : new com.lh.eap.api.TaskRef(mutation.equals("project") ? "foreign" : target.projectId(),
                mutation.equals("task") ? UUID.randomUUID() : target.taskId(), mutation.equals("revision") ? 4 : target.revision());
        runTask = mutation.equals("missingRun") ? null : new BoardRunService.Snapshot(mutation.equals("title") ? "other" : "title",
                mutation.equals("goal") ? "other" : "goal", mutation.equals("criteria") ? "other" : "criteria",
                mutation.equals("prototype") ? new BoardPrototypeService.Reference(UUID.randomUUID(), "builder-alpha", "test", "a".repeat(64), now) : null);
        assertEquals("BOARD_DELIVERY_APPLICATION_TASK_MISMATCH", assertThrows(ResponseStatusException.class, this::associate).getReason());
    }
    @Test void missingApplicationTimesFailClosed() {
        started=null; finished=null;
        assertEquals("BOARD_DELIVERY_APPLICATION_TIME_MISMATCH",assertThrows(ResponseStatusException.class,this::associate).getReason());
    }
    @ParameterizedTest @ValueSource(strings={"PROPOSED", "APPLYING", "FAILED", "UNKNOWN", "resultStatus", "resultId", "written", "missingResult", "readonly"})
    void rejectsNonAppliedOrContradictoryResults(String mutation) {
        if (Set.of("PROPOSED", "APPLYING", "FAILED", "UNKNOWN").contains(mutation)) status = mutation;
        if (mutation.equals("readonly")) proposal = new CodeChangeService.Proposal(id, conversation, "repo", "", proposal.files(), now, false, false, "not_requested", generation.reference());
        applied = mutation.equals("missingResult") ? null : new CodeChangeService.Applied(mutation.equals("resultId") ? UUID.randomUUID() : id,
            mutation.equals("written") ? List.of("frontend/other.ts") : applied.written(), "not_requested", List.of(), mutation.equals("resultStatus") ? "FAILED" : "APPLIED", applied.afterHash(), "");
        assertEquals("BOARD_DELIVERY_APPLICATION_NOT_APPLIED", assertThrows(ResponseStatusException.class, this::associate).getReason());
    }
    @ParameterizedTest @ValueSource(strings={"content", "resultHash", "captureHash", "captureContent", "verificationHash", "selection"})
    void requiresSameSingleFileHashAcrossAllAuthorities(String mutation) {
        if (mutation.equals("content")) proposal = new CodeChangeService.Proposal(id, conversation, "repo", "", List.of(new CodeChangeService.Change(generation.targetPath(), "before", "different", generation.baseHash())), now, false, true, "", generation.reference());
        if (mutation.equals("resultHash")) applied = new CodeChangeService.Applied(id, applied.written(), "", List.of(), "APPLIED", "f".repeat(64), "");
        if (mutation.startsWith("capture")) files = List.of(new BoardDeliveryCapture.File(generation.targetPath(), generation.baseHash(), mutation.equals("captureHash") ? "f".repeat(64) : applied.afterHash(), "before", mutation.equals("captureContent") ? "different" : "after"));
        if (mutation.equals("verificationHash")) source = new BoardVerificationSource.Source("frontend", "source", List.of(new BoardVerificationSource.File(generation.targetPath(), "f".repeat(64), 5)), List.of());
        if (mutation.equals("selection")) files = List.of(files.getFirst(), new BoardDeliveryCapture.File("frontend/other.ts", "absent", applied.afterHash(), "", "after"));
        assertEquals("BOARD_DELIVERY_APPLICATION_SOURCE_MISMATCH", assertThrows(ResponseStatusException.class, this::associate).getReason());
    }
    @ParameterizedTest @ValueSource(strings={"missing", "late", "reversed", "beforeGeneration"})
    void applicationMustFinishBeforeVerificationStarts(String mutation) {
        if (mutation.equals("missing")) finished = null;
        if (mutation.equals("late")) finished = now.plusSeconds(3);
        if (mutation.equals("reversed")) started = now.plusSeconds(2);
        if (mutation.equals("beforeGeneration")) started = now.minusSeconds(1);
        assertEquals("BOARD_DELIVERY_APPLICATION_TIME_MISMATCH", assertThrows(ResponseStatusException.class, this::associate).getReason());
    }
    @ParameterizedTest @ValueSource(strings={"runOnly", "generationOnly", "id", "hash", "partial"})
    void requiresExactPrototypeIdentityAndHashOrBothAbsent(String mutation) {
        var version = UUID.randomUUID(); var hash = "a".repeat(64);
        if (!mutation.equals("generationOnly")) prototype = new BoardPrototypeService.Reference(version, "builder", "test", hash, now);
        generation = new CodeGenerationStore.Snapshot(generation.id(), principal, conversation, "repo", generation.targetPath(), generation.baseHash(), generation.source(),
            mutation.equals("runOnly") ? "" : mutation.equals("id") ? UUID.randomUUID().toString() : version.toString(),
            mutation.equals("partial") || mutation.equals("runOnly") ? "" : mutation.equals("hash") ? "b".repeat(64) : hash, now);
        proposal = new CodeChangeService.Proposal(id, conversation, "repo", "", proposal.files(), now, false, true, "", generation.reference());
        assertEquals("BOARD_DELIVERY_APPLICATION_PROTOTYPE_MISMATCH", assertThrows(ResponseStatusException.class, this::associate).getReason());
    }
    @ParameterizedTest @ValueSource(strings={"principal", "conversation", "proposal", "workspace", "target", "generationPrincipal", "generationId", "generationConversation", "generationWorkspace", "generationTarget", "generationBase", "generationSource", "generationReference"})
    void rejectsCrossScopeOrInconsistentGeneration(String mutation) {
        if (mutation.equals("principal")) principal = "foreign";
        if (Set.of("conversation", "proposal", "workspace", "target", "generationReference").contains(mutation)) {
            var change = proposal.files().getFirst();
            proposal = new CodeChangeService.Proposal(mutation.equals("proposal") ? UUID.randomUUID() : id, mutation.equals("conversation") ? UUID.randomUUID() : conversation,
                mutation.equals("workspace") ? "other" : "repo", "candidate", List.of(new CodeChangeService.Change(mutation.equals("target") ? "frontend/other.ts" : change.path(), change.before(), change.content(), change.baseHash())), now, false, true, "not_requested", mutation.equals("generationReference") ? null : generation.reference());
        }
        if (mutation.startsWith("generation") && !mutation.equals("generationReference")) generation = new CodeGenerationStore.Snapshot(
            mutation.equals("generationId") ? UUID.randomUUID() : generation.id(), mutation.equals("generationPrincipal") ? "foreign" : principal,
            mutation.equals("generationConversation") ? UUID.randomUUID() : conversation, mutation.equals("generationWorkspace") ? "other" : "repo",
            mutation.equals("generationTarget") ? "frontend/other.ts" : generation.targetPath(), mutation.equals("generationBase") ? "b".repeat(64) : generation.baseHash(),
            mutation.equals("generationSource") ? "different" : generation.source(), "", "", now);
        assertEquals("BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH", assertThrows(ResponseStatusException.class, this::associate).getReason());
    }
}
