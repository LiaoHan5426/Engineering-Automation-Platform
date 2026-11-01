package com.lh.eap.ai;

import java.util.Optional;
import java.util.UUID;

/** Durable single-file proposal authority. No task/run attribution is inferred. */
public interface CodeProposalStore {
    record Stored(String principal, CodeChangeService.Proposal proposal, String status,
                  CodeChangeService.Applied result, String reason) {}
    void save(String principal, CodeChangeService.Proposal proposal);
    Optional<Stored> find(String principal, UUID conversation, UUID id);
    /** Independently commit PROPOSED -> APPLYING under the shared workspace lock. */
    boolean claim(String principal, UUID conversation, UUID id);
    /** Independently commit a terminal observation, only from APPLYING. */
    void finish(String principal, UUID conversation, UUID id, String status, CodeChangeService.Applied result, String reason);
    void recoverInterrupted(String workspace);
    <T> T withoutTransaction(java.util.function.Supplier<T> action);
}
