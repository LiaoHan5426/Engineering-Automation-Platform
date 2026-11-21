package com.lh.eap.ai.execution;

import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.ai.dto.ChatExecutionSnapshot;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

/**
 * Durable, read-only evidence store for chat execution events (CT-01). This is a domain port so
 * the chat orchestration can persist execution logs without depending on a persistence
 * technology; the JDBC implementation lives in the application composition module.
 *
 * <p>This store is NOT an execution takeover mechanism. It records what already happened so a
 * restarted process can replay it via {@link #read}. It never resumes a model call, never
 * re-runs a tool and never fabricates a terminal state. When no implementation is wired
 * (unit tests, minimal compositions), callers keep the pre-existing in-memory behaviour.
 */
public interface ChatExecutionStore {
    /** Insert the execution head. Idempotent by execution id. */
    void open(UUID executionId, UUID conversationId, String initialStatus, Instant now);

    /** Append one immutable event. Duplicate (executionId, sequence) is rejected by the store. */
    void appendEvent(ChatExecutionEvent event);

    /** Advance the execution head to a terminal (or UNKNOWN) state. */
    void finish(UUID executionId, String status, boolean complete, Instant now);

    /**
     * Read events after a cursor. Returns empty when the execution was never persisted.
     * The store forces an unfinished execution to be replayed as UNKNOWN / {@code complete=false},
     * so a restarted process never mistakes an interrupted turn for a resumable one.
     */
    Optional<ChatExecutionSnapshot> read(UUID conversationId, UUID executionId, long afterSequence);
}
