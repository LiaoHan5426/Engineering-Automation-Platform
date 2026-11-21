package com.lh.eap.application.service;

import java.util.Objects;
import java.util.function.Supplier;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Bounded transaction boundaries for the legacy fixed-DAG execution path.
 *
 * <p>The old {@code ExpertExecutionService.execute} held one REPEATABLE_READ transaction across graph
 * scheduling, every capability handler (CLI/MCP/knowledge) and the model call. That kept a database
 * connection and a snapshot open for the whole external work. These boundaries split it into a short
 * read-only snapshot, a no-transaction execution phase and a short write transaction that revalidates
 * the definition before persisting. No model, process or remote tool call ever runs inside a callback.
 *
 * <p>A missing transaction manager is allowed for lightweight/composition setups: each callback then
 * runs directly and the underlying operations fall back to their own auto-commit behavior. This keeps
 * the bean constructible without a datasource and never recreates the long transaction.
 */
public final class DagExecutionTransactions {
    private final TransactionTemplate read;
    private final TransactionTemplate write;
    private final boolean managed;

    public DagExecutionTransactions(PlatformTransactionManager manager) {
        this.managed = manager != null;
        if (this.managed) {
            var readTemplate = new TransactionTemplate(Objects.requireNonNull(manager));
            readTemplate.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
            readTemplate.setReadOnly(true);
            readTemplate.setTimeout(10);
            this.read = readTemplate;

            var writeTemplate = new TransactionTemplate(manager);
            writeTemplate.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
            writeTemplate.setTimeout(10);
            this.write = writeTemplate;
        } else {
            this.read = null;
            this.write = null;
        }
    }

    /** Short read-only transaction for capturing the definition/policy/grant snapshot. */
    public <T> T snapshot(Supplier<T> work) { return run(read, work); }

    /** Short write transaction for the pre-commit recheck and the single result write. */
    public <T> T commit(Supplier<T> work) { return run(write, work); }

    public boolean isManaged() { return managed; }

    private <T> T run(TransactionTemplate template, Supplier<T> work) {
        return template == null ? work.get() : template.execute(status -> work.get());
    }
}
