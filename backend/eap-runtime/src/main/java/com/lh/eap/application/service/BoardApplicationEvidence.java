package com.lh.eap.application.service;

import com.lh.eap.ai.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import static com.lh.eap.application.service.BoardVerificationSource.denied;

/** Read-only durable Chat evidence. Association is post hoc, never generation-time Task authorship. */
@Service
public class BoardApplicationEvidence {
    public record Evidence(String association, UUID conversationId, UUID proposalId, UUID generationId,
                           String targetPath, String generationBaseHash, String appliedAfterHash,
                           Instant generationCapturedAt, String prototypeVersionId, String prototypeContentHash,
                           Instant associatedAt, String operator) {}
    private final CodeProposalStore proposals;
    private final CodeGenerationStore generations;
    public BoardApplicationEvidence(CodeProposalStore proposals, CodeGenerationStore generations) {
        this.proposals = proposals; this.generations = generations;
    }
    public Evidence associate(BoardDeliveryService.ApplicationRef ref, String workspace, BoardPrototypeService.Reference prototype,
                              BoardVerificationService.Record verification, List<BoardDeliveryCapture.File> files, Instant associatedAt) {
        var row = proposals.find(AiConversationRegistry.PRINCIPAL, ref.conversationId(), ref.proposalId())
            .orElseThrow(() -> denied("BOARD_DELIVERY_APPLICATION_NOT_FOUND"));
        var proposal = row.proposal();
        if (!AiConversationRegistry.PRINCIPAL.equals(row.principal()) || proposal == null
                || !ref.proposalId().equals(proposal.id()) || !ref.conversationId().equals(proposal.conversationId())
                || !workspace.equals(proposal.workspace()) || proposal.generation() == null || proposal.files() == null || proposal.files().size() != 1)
            throw denied("BOARD_DELIVERY_APPLICATION_SCOPE_MISMATCH");
        var generation = generations.find(proposal.generation().id())
            .orElseThrow(() -> denied("BOARD_DELIVERY_APPLICATION_NOT_FOUND"));
        var change = proposal.files().getFirst();
        if (!AiConversationRegistry.PRINCIPAL.equals(generation.principal()) || !ref.conversationId().equals(generation.conversationId())
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
        return new Evidence("POST_HOC", ref.conversationId(), ref.proposalId(), generation.id(), generation.targetPath(),
            generation.baseHash(), row.result().afterHash(), generation.capturedAt(), emptyToNull(generation.prototypeVersionId()),
            emptyToNull(generation.prototypeContentHash()), associatedAt, AiConversationRegistry.PRINCIPAL);
    }
    private static String emptyToNull(String value) { return value == null || value.isEmpty() ? null : value; }
}
