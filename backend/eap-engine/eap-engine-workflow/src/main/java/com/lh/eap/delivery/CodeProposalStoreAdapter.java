package com.lh.eap.delivery;

import com.lh.eap.application.service.BoardApplicationBaseline;
import com.lh.eap.core.CodeEvidenceStore;
import com.lh.eap.core.CodeProposalEvidenceStore;
import com.lh.eap.core.CodeTaskBinding;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

/**
 * Workflow-side mapping adapter. Baseline evidence stays in {@link BoardApplicationBaseline}; all SQL
 * lives in {@link CodeProposalEvidenceStore}'s JDBC implementation.
 */
@Repository
public class CodeProposalStoreAdapter implements CodeProposalStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final CodeProposalEvidenceStore store;
    private final CodeGenerationStore generations;
    private final CodeTaskBinding binding;
    private final BoardApplicationBaseline baselines;

    public CodeProposalStoreAdapter(CodeProposalEvidenceStore store, CodeGenerationStore generations,
                                    CodeTaskBinding binding, BoardApplicationBaseline baselines) {
        this.store = store;
        this.generations = generations;
        this.binding = binding;
        this.baselines = Objects.requireNonNull(baselines);
    }

    @Override public <T> T withoutTransaction(Supplier<T> action) { return store.withoutTransaction(action); }

    @Override public void save(String principal, CodeChangeService.Proposal proposal) {
        if (proposal.generation() == null) throw new IllegalArgumentException("generation required");
        var snapshot = generations.find(proposal.generation().id()).orElseThrow();
        if (!snapshot.reference().equals(proposal.generation()) || proposal.files().size() != snapshot.sources().size())
            throw new IllegalArgumentException("generation scope mismatch");
        for (int i = 0; i < snapshot.sources().size(); i++) {
            var source = snapshot.sources().get(i);
            var change = proposal.files().get(i);
            if (!source.path().equals(change.path()) || !source.baseHash().equals(change.baseHash())
                    || !Objects.equals(source.content(), change.before()))
                throw new IllegalArgumentException("generation scope mismatch");
        }
        ComponentGraph.validate(snapshot.targetPath(), proposal.files());
        store.saveProposal(principal, map(proposal));
    }

    @Override public Optional<Stored> find(String principal, UUID conversation, UUID id) {
        return store.findProposal(principal, conversation, id).map(CodeProposalStoreAdapter::map);
    }

    @Override public boolean claim(String principal, UUID conversation, UUID id) {
        var row = store.findProposal(principal, conversation, id).orElseThrow();
        var proposal = map(row.proposal());
        return store.claim(principal, conversation, id, binding, () -> {
            var baseline = baselines.capture(proposal);
            return baseline == null ? null : JSON.writeValueAsString(baseline);
        });
    }

    @Override public void recoverInterrupted(String workspace) { store.recoverInterrupted(workspace); }

    @Override public void finish(String principal, UUID conversation, UUID id, String status,
                                 CodeChangeService.Applied result, String reason) {
        store.finish(principal, conversation, id, status, result == null ? null : map(result), reason);
    }

    @Override public void refuse(String principal, UUID conversation, UUID id, String reason) {
        store.refuse(principal, conversation, id, reason);
    }

    // --- SourceWriteReview's review surface: still the workflow's type, backed by the core port. ---
    public record ReviewRow(SourceWriteReview.Item item, CodeChangeService.Proposal proposal,
                            SourceWriteReview.Resolution resolution) {}

    public List<SourceWriteReview.Item> reviewItems(String principal, String workspace) {
        return store.reviewItems(principal, workspace).stream().map(CodeProposalStoreAdapter::map).toList();
    }

    public Optional<ReviewRow> reviewRow(String principal, String workspace, UUID id) {
        return store.reviewRow(principal, workspace, id).map(row -> new ReviewRow(
                map(row.item()), map(row.proposal()), row.resolution() == null ? null : map(row.resolution())));
    }

    public <T> T reviewLocked(String workspace, Supplier<T> action) {
        return store.reviewLocked(workspace, action);
    }

    public void closeUnknown(String principal, String workspace, UUID id, SourceWriteReview.Resolution resolution) {
        store.closeUnknown(principal, workspace, id, map(resolution));
    }

    private static CodeEvidenceStore.Change map(CodeChangeService.Change change) {
        return new CodeEvidenceStore.Change(change.path(), change.before(), change.content(), change.baseHash());
    }

    private static CodeChangeService.Change map(CodeEvidenceStore.Change change) {
        return new CodeChangeService.Change(change.path(), change.before(), change.content(), change.baseHash());
    }

    private static CodeEvidenceStore.Generation map(CodeChangeService.Generation generation) {
        return generation == null ? null : new CodeEvidenceStore.Generation(generation.id(), generation.targetPath(),
                generation.baseHash(), generation.capturedAt(), generation.prototypeVersionId(),
                generation.prototypeContentHash(), generation.taskBinding(), generation.companionFiles().stream()
                .map(file -> new CodeEvidenceStore.Baseline(file.path(), file.baseHash())).toList());
    }

    private static CodeChangeService.Generation map(CodeEvidenceStore.Generation generation) {
        return generation == null ? null : new CodeChangeService.Generation(generation.id(), generation.targetPath(),
                generation.baseHash(), generation.capturedAt(), generation.prototypeVersionId(),
                generation.prototypeContentHash(), generation.taskBinding(), generation.companionFiles().stream()
                .map(file -> new ComponentGraph.Baseline(file.path(), file.baseHash())).toList());
    }

    private static CodeEvidenceStore.Proposal map(CodeChangeService.Proposal proposal) {
        return new CodeEvidenceStore.Proposal(proposal.id(), proposal.conversationId(), proposal.workspace(),
                proposal.summary(), proposal.files().stream().map(CodeProposalStoreAdapter::map).toList(),
                proposal.createdAt(), proposal.applied(), proposal.writeAllowed(), proposal.verification(),
                map(proposal.generation()));
    }

    private static CodeChangeService.Proposal map(CodeEvidenceStore.Proposal proposal) {
        return new CodeChangeService.Proposal(proposal.id(), proposal.conversationId(), proposal.workspace(),
                proposal.summary(), proposal.files().stream().map(CodeProposalStoreAdapter::map).toList(),
                proposal.createdAt(), proposal.applied(), proposal.writeAllowed(), proposal.verification(),
                map(proposal.generation()));
    }

    private static CodeEvidenceStore.Applied map(CodeChangeService.Applied result) {
        return new CodeEvidenceStore.Applied(result.id(), result.written(), result.verification(),
                result.checks().stream().map(check -> new CodeEvidenceStore.Check(check.name(), check.exitCode(), check.summary())).toList(),
                result.status(), result.afterHash(), result.reason());
    }

    private static CodeChangeService.Applied map(CodeEvidenceStore.Applied result) {
        return new CodeChangeService.Applied(result.id(), result.written(), result.verification(),
                result.checks().stream().map(check -> new CodeVerificationService.Check(check.name(), check.exitCode(), check.summary())).toList(),
                result.status(), result.afterHash(), result.reason());
    }

    private static Stored map(CodeEvidenceStore.Stored row) {
        return new Stored(row.principal(), map(row.proposal()), row.status(),
                row.result() == null ? null : map(row.result()), row.reason(), row.startedAt(), row.finishedAt());
    }

    private static SourceWriteReview.Item map(CodeEvidenceStore.ReviewItem item) {
        return new SourceWriteReview.Item(item.id(), item.status(), item.reason(), item.startedAt());
    }

    private static CodeEvidenceStore.Resolution map(SourceWriteReview.Resolution resolution) {
        return new CodeEvidenceStore.Resolution(resolution.requestId(), resolution.operator(), resolution.closedAt(),
                resolution.note(), new CodeEvidenceStore.Observation(resolution.observation().files().stream()
                        .map(file -> new CodeEvidenceStore.FileEvidence(file.path(), file.baselineHash(), file.candidateHash(),
                                file.currentHash(), CodeEvidenceStore.FileMatch.valueOf(file.match().name()))).toList(),
                        resolution.observation().digest()));
    }

    private static SourceWriteReview.Resolution map(CodeEvidenceStore.Resolution resolution) {
        return new SourceWriteReview.Resolution(resolution.requestId(), resolution.operator(), resolution.closedAt(),
                resolution.note(), new SourceWriteReview.Observation(resolution.observation().files().stream()
                        .map(file -> new SourceWriteReview.FileEvidence(file.path(), file.baselineHash(), file.candidateHash(),
                                file.currentHash(), SourceWriteReview.FileMatch.valueOf(file.match().name()))).toList(),
                        resolution.observation().digest()));
    }
}
