package com.lh.eap.core;

/**
 * Repository-local workspace authority shared by Board and Chat.
 *
 * <p>Only the SQL belongs here. The "a reservation requires a transaction" rule and the decision
 * to combine code/board activity into a busy answer stay in the orchestration layer. Never hold a
 * lock over a filesystem write: commit the durable active intent instead.
 */
public interface WorkspaceLockStore {
    /** Block until the transaction-scoped advisory lock for this workspace is held. */
    void lock(String workspace);

    /** Whether an enabled code proposal is bound to this workspace. */
    boolean codeActive(String workspace);

    /** Whether a blocking run or verification is bound to this workspace. */
    boolean boardActive(String workspace);
}
