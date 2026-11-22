package com.lh.eap.application.service;

import com.lh.eap.core.WorkspaceLockStore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * One repository-local authority, shared by Board and Chat. Task locks (if any) come first.
 *
 * <p>The transaction rule and the busy decision belong here; the SQL lives in the
 * {@link WorkspaceLockStore} adapter. Never hold this transaction over a filesystem write: commit
 * the durable active intent instead.
 */
@Service
public class WorkspaceInterlock {
    private final WorkspaceLockStore store;

    public WorkspaceInterlock(WorkspaceLockStore store) {
        this.store = store;
    }

    public void lock(String workspace) {
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Workspace reservation requires a transaction");
        store.lock(workspace);
    }

    public boolean codeActive(String workspace) {
        return store.codeActive(workspace);
    }

    public boolean boardActive(String workspace) {
        return store.boardActive(workspace);
    }
}
