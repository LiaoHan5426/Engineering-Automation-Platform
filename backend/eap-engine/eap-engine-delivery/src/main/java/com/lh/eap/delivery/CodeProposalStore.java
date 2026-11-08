package com.lh.eap.delivery;
import com.lh.eap.delivery.CodeChangeService;

import java.util.Optional;
import java.util.UUID;

/** Durable single-file proposal authority. No task/run attribution is inferred. */
public interface CodeProposalStore {
    record Stored(String principal, CodeChangeService.Proposal proposal, String status,
                  CodeChangeService.Applied result, String reason, java.time.Instant startedAt, java.time.Instant finishedAt) {
        public Stored(String principal, CodeChangeService.Proposal proposal, String status, CodeChangeService.Applied result, String reason) {
            this(principal, proposal, status, result, reason, null, null);
        }
    }
    void save(String principal, CodeChangeService.Proposal proposal);
    Optional<Stored> find(String principal, UUID conversation, UUID id);
    /** Independently commit PROPOSED -> APPLYING under the shared workspace lock. */
    boolean claim(String principal, UUID conversation, UUID id);
    /** Independently commit a terminal observation, only from APPLYING. */
    void finish(String principal, UUID conversation, UUID id, String status, CodeChangeService.Applied result, String reason);
    /** Operator decline before apply intent is claimed. */
    void refuse(String principal, UUID conversation, UUID id, String reason);
    void recoverInterrupted(String workspace);
    <T> T withoutTransaction(java.util.function.Supplier<T> action);
}
