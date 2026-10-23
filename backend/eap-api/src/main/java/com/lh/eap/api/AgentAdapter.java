package com.lh.eap.api;

import java.nio.file.Path;
import java.util.*;

/** Provider-specific protocols stay outside ProcessExecutor. Trusted server-side entry point. */
public interface AgentAdapter {
    record Task(UUID executionId, Path repository, String instructions, String model, boolean approved) {}
    record Event(long sequence, String type, String sessionId, String summary, java.time.Instant receivedAt) {
        public Event(long sequence,String type,String sessionId,String summary){this(sequence,type,sessionId,summary,null);}
    }
    record RetryPolicy(int eapAutomaticRetries, String codexInternalRetries) {}
    record Outcome(UUID executionId, String providerVersion, String requestedModel, String transmittedModel,
                   String modelEvidence, RetryPolicy retryPolicy, String error, CliExecution.Result execution,
                   List<Event> events, String gitBefore, String gitAfter, String diff) {
        public Outcome { events=List.copyOf(events); }
    }
    Outcome execute(Task task);
    Optional<CliExecution.Snapshot> status(UUID id);
    Optional<CliExecution.Snapshot> cancel(UUID id);
}
