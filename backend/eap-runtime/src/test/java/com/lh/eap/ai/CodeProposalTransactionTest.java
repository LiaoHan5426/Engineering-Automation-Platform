package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.*;
import org.springframework.transaction.support.*;
import java.util.function.Supplier;

class CodeProposalTransactionTest {
    static final class Transactions extends AbstractPlatformTransactionManager {
        static final class Tx { boolean active; Tx(boolean active) { this.active=active; } }
        boolean active;
        protected Object doGetTransaction() { return new Tx(active); }
        protected boolean isExistingTransaction(Object tx) { return ((Tx) tx).active; }
        protected void doBegin(Object tx, TransactionDefinition definition) { active=true; ((Tx)tx).active=true; }
        protected void doCommit(DefaultTransactionStatus status) {}
        protected void doRollback(DefaultTransactionStatus status) {}
        protected Object doSuspend(Object tx) { active=false; ((Tx)tx).active=false; return true; }
        protected void doResume(Object tx, Object suspended) { active=true; if (tx != null) ((Tx)tx).active=true; }
        protected void doCleanupAfterCompletion(Object tx) { active=false; }
    }
    @Test void filesystemBoundarySuspendsEvenAnEnclosingCallerTransaction() {
        var manager = new Transactions();
        var store = new JdbcCodeProposalStore(org.mockito.Mockito.mock(org.springframework.jdbc.core.JdbcTemplate.class), manager);
        new TransactionTemplate(manager).executeWithoutResult(tx -> {
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
            Boolean inTransaction = store.withoutTransaction(TransactionSynchronizationManager::isActualTransactionActive);
            assertFalse(inTransaction);
            assertTrue(TransactionSynchronizationManager.isActualTransactionActive());
        });
    }
}
