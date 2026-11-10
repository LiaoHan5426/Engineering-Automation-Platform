package com.lh.eap.core;

import com.lh.eap.api.Observation;
import java.time.Instant;
import java.util.*;

/** Durable continuation of an existing Task, with fenced ownership and finite retry allowance. */
public interface ExpertAgentJournal {
    record Entry(UUID id, ExpertAgentAccess.Snapshot snapshot, String request, String checkpoint,
                 String state, int attempts, UUID owner, Instant leaseUntil, Instant expiresAt, String result, boolean automatic) {
        public Entry { ExpertAgentState.fromWire(state); }
    }
    record Pending(UUID id, String expertId, int attempts) { }
    record Summary(UUID id, String expertId, String expertName, String state, int attempts, boolean automatic,
                   Instant createdAt, Instant updatedAt, Instant expiresAt) {
        public Summary { ExpertAgentState.fromWire(state); }
    }
    void create(UUID id, ExpertAgentAccess.Snapshot snapshot, String request, String goal);
    Entry enqueue(UUID id, ExpertAgentAccess.Snapshot snapshot, String request, String goal);
    List<Pending> pending(int limit);
    List<Summary> list(int limit);
    void failPending(Pending pending, String error);
    Entry get(String expertId, UUID id);
    Entry claim(String expertId, UUID id);
    void check(Entry lease);
    void checkpoint(Entry lease, String checkpoint);
    void finish(Entry lease, String state, String result, String modelState, List<Observation> observations);
    boolean cancel(String expertId, UUID id);
    void recoverExpired();
}
