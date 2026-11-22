package com.lh.eap.core;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Supplier;

/** SQL-only authority for durable proposals and their operator review surface. */
public interface CodeProposalEvidenceStore {
    void saveProposal(String principal, CodeEvidenceStore.Proposal proposal);

    Optional<CodeEvidenceStore.Stored> findProposal(String principal, UUID conversation, UUID id);

    /** CAS PROPOSED -> APPLYING under the workspace lock; baseline JSON is supplied by the service layer. */
    boolean claim(String principal, UUID conversation, UUID id, CodeTaskBinding binding, Supplier<String> baseline);

    void recoverInterrupted(String workspace);

    void finish(String principal, UUID conversation, UUID id, String status,
                CodeEvidenceStore.Applied result, String reason);

    void refuse(String principal, UUID conversation, UUID id, String reason);

    <T> T withoutTransaction(Supplier<T> action);

    List<CodeEvidenceStore.ReviewItem> reviewItems(String principal, String workspace);

    Optional<CodeEvidenceStore.ReviewRow> reviewRow(String principal, String workspace, UUID id);

    <T> T reviewLocked(String workspace, Supplier<T> action);

    void closeUnknown(String principal, String workspace, UUID id, CodeEvidenceStore.Resolution resolution);
}
