package com.lh.eap.application.service;
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
                           Instant associatedAt, String operator, com.lh.eap.api.TaskRef taskBinding) {
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
                              com.lh.eap.api.TaskRef target, BoardRunService.Snapshot runTask) {
        var row = proposals.find(com.lh.eap.config.RuntimeWorkspace.OPERATOR_LABEL, ref.conversationId(), ref.proposalId())
            .orElseThrow(() -> denied("BOARD_DELIVERY_APPLICATION_NOT_FOUND"));
        var proposal = row.proposal();
        if (!com.lh.eap.config.RuntimeWorkspace.OPERATOR_LABEL.equals(row.principal()) || proposal == null
                || !ref.proposalId().equals(proposal.id()) || !ref.conversationId().equals(proposal.conversationId())
                || !workspace.equals(proposal.workspace()) || proposal.generation() == null || proposal.files() == null || proposal.files().size() != 1)
            throw denied("BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH");
        var generation = generations.find(proposal.generation().id())
            .orElseThrow(() -> denied("BOARD_DELIVERY_APPLICATION_NOT_FOUND"));
        var change = proposal.files().getFirst();
        if (!com.lh.eap.config.RuntimeWorkspace.OPERATOR_LABEL.equals(generation.principal()) || !ref.conversationId().equals(generation.conversationId())
                || !workspace.equals(generation.workspace()) || !generation.reference().equals(proposal.generation())
                || !Objects.equals(change.path(), generation.targetPath()) || !Objects.equals(change.baseHash(), generation.baseHash())
                || !Objects.equals(change.before(), generation.source()) || !Objects.equals(generation.baseHash(), generation.source() == null ? "absent" : GitReviewCapture.hash(generation.source())))
            throw denied("BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH");
        var result = row.result();
        if (!"APPLIED".equals(row.status()) || !proposal.writeAllowed() || result == null || !"APPLIED".equals(result.status())
                || !ref.proposalId().equals(result.id()) || !List.of(generation.targetPath()).equals(result.written()))
            throw denied("BOARD_DELIVERY_APPLICATION_NOT_APPLIED");
        String after = change.content() == null ? null : GitReviewCapture.hash(change.content());
        if (after == null || !after.equals(result.afterHash()) || files == null || files.size() != 1
                || !generation.targetPath().equals(files.getFirst().path()) || !after.equals(files.getFirst().afterHash())
                || !Objects.equals(change.content(), files.getFirst().after()) || verification.plan() == null || verification.plan().source() == null
                || verification.plan().source().files().stream().filter(file -> generation.targetPath().equals(file.path()) && after.equals(file.contentHash())).count() != 1)
            throw denied("BOARD_DELIVERY_APPLICATION_SOURCE_MISMATCH");
        if (generation.capturedAt() == null || row.startedAt() == null || row.finishedAt() == null || verification.startedAt() == null
                || row.startedAt().isBefore(generation.capturedAt()) || row.finishedAt().isBefore(row.startedAt())
                || row.finishedAt().isAfter(verification.startedAt()))
            throw denied("BOARD_DELIVERY_APPLICATION_TIME_MISMATCH");
        if (!Objects.equals(emptyToNull(generation.prototypeVersionId()), prototype == null ? null : prototype.id().toString())
                || !Objects.equals(emptyToNull(generation.prototypeContentHash()), prototype == null ? null : prototype.contentHash()))
            throw denied("BOARD_DELIVERY_APPLICATION_PROTOTYPE_MISMATCH");
        var task = generation.taskSnapshot();
        if (task != null && (target == null || !task.binding().equals(target) || runTask == null
                || !task.title().equals(runTask.title()) || !task.goal().equals(runTask.goal())
                || !task.acceptanceCriteria().equals(runTask.acceptanceCriteria())
                || !Objects.equals(task.prototype() == null ? null : new BoardPrototypeService.Reference(task.prototype().id(),
                    task.prototype().sourceRef(), task.prototype().title(), task.prototype().contentHash(), task.prototype().createdAt()), runTask.prototype())))
            throw denied("BOARD_DELIVERY_APPLICATION_TASK_MISMATCH");
        return new Evidence(task == null ? "POST_HOC" : "PREBOUND", ref.conversationId(), ref.proposalId(), generation.id(), generation.targetPath(),
            generation.baseHash(), row.result().afterHash(), generation.capturedAt(), emptyToNull(generation.prototypeVersionId()),
            emptyToNull(generation.prototypeContentHash()), associatedAt, com.lh.eap.config.RuntimeWorkspace.OPERATOR_LABEL, task == null ? null : task.binding());
    }
    private static String emptyToNull(String value) { return value == null || value.isEmpty() ? null : value; }
}
