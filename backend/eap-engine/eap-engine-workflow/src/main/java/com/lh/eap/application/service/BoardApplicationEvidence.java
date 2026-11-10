package com.lh.eap.application.service;
import com.lh.eap.api.TaskRef;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.CodeProposalStatus;
import com.lh.eap.error.BoardDeliveryErrors;
import com.lh.eap.delivery.CodeProposalStore;
import com.lh.eap.delivery.CodeGenerationStore;


import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import static com.lh.eap.application.service.BoardVerificationSource.denied;

/** Read-only durable Chat evidence; PREBOUND requires an original immutable task snapshot. */
@Service
public class BoardApplicationEvidence {
    public record Evidence(String association, UUID conversationId, UUID proposalId, UUID generationId,
                           String targetPath, String generationBaseHash, String appliedAfterHash,
                           Instant generationCapturedAt, String prototypeVersionId, String prototypeContentHash,
                           Instant associatedAt, String operator, TaskRef taskBinding) {
        public Evidence(String association, UUID conversationId, UUID proposalId, UUID generationId, String targetPath,
                        String generationBaseHash, String appliedAfterHash, Instant generationCapturedAt,
                        String prototypeVersionId, String prototypeContentHash, Instant associatedAt, String operator) {
            this(association, conversationId, proposalId, generationId, targetPath, generationBaseHash, appliedAfterHash,
                    generationCapturedAt, prototypeVersionId, prototypeContentHash, associatedAt, operator, null);
        }
    }
    private final CodeProposalStore proposals;
    private final CodeGenerationStore generations;
    public BoardApplicationEvidence(CodeProposalStore proposals, CodeGenerationStore generations) {
        this.proposals = proposals; this.generations = generations;
    }
    public Evidence associate(BoardDeliveryService.ApplicationRef ref, String workspace, BoardPrototypeService.Reference prototype,
                              BoardVerificationService.Record verification, List<BoardDeliveryCapture.File> files, Instant associatedAt) {
        return associate(ref, workspace, prototype, verification, files, associatedAt, null, null);
    }
    public Evidence associate(BoardDeliveryService.ApplicationRef ref, String workspace, BoardPrototypeService.Reference prototype,
                              BoardVerificationService.Record verification, List<BoardDeliveryCapture.File> files, Instant associatedAt,
                              TaskRef target, BoardRunService.Snapshot runTask) {
        var row = proposals.find(RuntimeWorkspace.OPERATOR_LABEL, ref.conversationId(), ref.proposalId())
            .orElseThrow(() -> denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_NOT_FOUND.code()));
        var proposal = row.proposal();
        if (!RuntimeWorkspace.OPERATOR_LABEL.equals(row.principal()) || proposal == null
                || !ref.proposalId().equals(proposal.id()) || !ref.conversationId().equals(proposal.conversationId())
                || !workspace.equals(proposal.workspace()) || proposal.generation() == null || proposal.files() == null || proposal.files().isEmpty() || proposal.files().size()>8)
            throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH.code());
        var generation = generations.find(proposal.generation().id())
            .orElseThrow(() -> denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_NOT_FOUND.code()));
        if (!RuntimeWorkspace.OPERATOR_LABEL.equals(generation.principal()) || !ref.conversationId().equals(generation.conversationId())
                || !workspace.equals(generation.workspace()) || !generation.reference().equals(proposal.generation())
                || proposal.files().size()!=generation.sources().size())throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH.code());
        for (int i=0;i<proposal.files().size();i++) {
            var change=proposal.files().get(i);var source=generation.sources().get(i);
            if (!change.path().equals(source.path()) || !change.baseHash().equals(source.baseHash()) || !Objects.equals(change.before(),source.content()))
                throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH.code());
        }
        var result=row.result();
        if(!CodeProposalStatus.APPLIED.wire().equals(row.status())||!proposal.writeAllowed()||result==null||!CodeProposalStatus.APPLIED.wire().equals(result.status())
            ||!ref.proposalId().equals(result.id())||!proposal.files().stream().map(CodeChangeService.Change::path).toList().equals(result.written()))
            throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_NOT_APPLIED.code());
        if(files==null||files.size()!=proposal.files().size()||verification.plan()==null||verification.plan().source()==null)
            throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_SOURCE_MISMATCH.code());
        for(int i=0;i<proposal.files().size();i++) {
            var change=proposal.files().get(i);var source=generation.sources().get(i);var delivered=files.get(i);
            String after=change.content()==null?null:GitReviewCapture.hash(change.content());
            if(!source.baseHash().equals(source.content()==null?"absent":GitReviewCapture.hash(source.content())))throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH.code());
            if(after==null||!change.path().equals(delivered.path())||!after.equals(delivered.afterHash())||!Objects.equals(change.content(),delivered.after())
                ||(i==0&&!after.equals(result.afterHash()))
                ||verification.plan().source().files().stream().filter(file->change.path().equals(file.path())&&after.equals(file.contentHash())).count()!=1)
                throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_SOURCE_MISMATCH.code());
        }
        if (generation.capturedAt() == null || row.startedAt() == null || row.finishedAt() == null || verification.startedAt() == null
                || row.startedAt().isBefore(generation.capturedAt()) || row.finishedAt().isBefore(row.startedAt())
                || row.finishedAt().isAfter(verification.startedAt()))
            throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_TIME_MISMATCH.code());
        if (!Objects.equals(emptyToNull(generation.prototypeVersionId()), prototype == null ? null : prototype.id().toString())
                || !Objects.equals(emptyToNull(generation.prototypeContentHash()), prototype == null ? null : prototype.contentHash()))
            throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_PROTOTYPE_MISMATCH.code());
        var task = generation.taskSnapshot();
        if (task != null && (target == null || !task.binding().equals(target) || runTask == null
                || !task.title().equals(runTask.title()) || !task.goal().equals(runTask.goal())
                || !task.acceptanceCriteria().equals(runTask.acceptanceCriteria())
                || !Objects.equals(task.prototype() == null ? null : new BoardPrototypeService.Reference(task.prototype().id(),
                    task.prototype().sourceRef(), task.prototype().title(), task.prototype().contentHash(), task.prototype().createdAt()), runTask.prototype())))
            throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_TASK_MISMATCH.code());
        return new Evidence(task == null ? "POST_HOC" : "PREBOUND", ref.conversationId(), ref.proposalId(), generation.id(), generation.targetPath(),
            generation.baseHash(), row.result().afterHash(), generation.capturedAt(), emptyToNull(generation.prototypeVersionId()),
            emptyToNull(generation.prototypeContentHash()), associatedAt, RuntimeWorkspace.OPERATOR_LABEL, task == null ? null : task.binding());
    }
    private static String emptyToNull(String value) { return value == null || value.isEmpty() ? null : value; }
}
