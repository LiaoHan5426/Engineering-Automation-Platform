package com.lh.eap.ai;

import java.util.*;

/** Explicit offline fixture, never a production fallback. */
class InMemoryCodeProposalStore implements CodeProposalStore {
    final Map<UUID, Stored> rows = new HashMap<>();
    @Override public <T> T withoutTransaction(java.util.function.Supplier<T> action) { return action.get(); }
    @Override public synchronized void recoverInterrupted(String workspace) {
        rows.replaceAll((id, row) -> row.proposal().workspace().equalsIgnoreCase(workspace) && row.status().equals("APPLYING")
                ? new Stored(row.principal(), row.proposal(), "UNKNOWN", null, "CODE_APPLICATION_INTERRUPTED") : row);
    }
    @Override public synchronized boolean claim(String principal, UUID conversation, UUID id) {
        var row = find(principal, conversation, id).orElseThrow();
        if (!row.status().equals("PROPOSED")) return false;
        if (rows.values().stream().anyMatch(other -> other.proposal().workspace().equalsIgnoreCase(row.proposal().workspace())
                && Set.of("APPLYING", "UNKNOWN").contains(other.status()))) throw new IllegalStateException("workspace busy");
        rows.put(id, new Stored(principal, row.proposal(), "APPLYING", null, "")); return true;
    }
    @Override public synchronized void finish(String principal, UUID conversation, UUID id, String status, CodeChangeService.Applied result, String reason) {
        var row = find(principal, conversation, id).orElseThrow();
        if (!row.status().equals("APPLYING")) throw new IllegalStateException("claim lost");
        rows.put(id, new Stored(principal, row.proposal(), status, result, reason));
    }
    @Override public synchronized void save(String principal, CodeChangeService.Proposal proposal) {
        if (rows.putIfAbsent(proposal.id(), new Stored(principal, proposal, "PROPOSED", null, "")) != null)
            throw new IllegalStateException("duplicate proposal");
    }
    @Override public synchronized Optional<Stored> find(String principal, UUID conversation, UUID id) {
        return Optional.ofNullable(rows.get(id)).filter(row -> row.principal().equals(principal)
                && row.proposal().conversationId().equals(conversation));
    }
}
