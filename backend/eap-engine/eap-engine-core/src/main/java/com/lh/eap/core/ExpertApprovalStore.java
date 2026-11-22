package com.lh.eap.core;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SQL-only boundary for human approval of SQL-expert candidates.
 * All state decisions, evidence checks and transactions stay in the service; CAS methods return the
 * affected row count so the service keeps the original conflict semantics.
 */
public interface ExpertApprovalStore {
    record ApplyingRun(UUID taskId, String expertId) { }

    /** CAS: bind one immutable candidate to a still-running, leased run with no prior proposal. */
    int bindCandidate(UUID taskId, UUID owner, UUID proposalId, String digest);

    /** Read-only approval columns used by inspect/review. */
    Map<String, Object> approval(UUID taskId);

    /** Read-only resolution columns; may be absent on a not-yet-migrated database. */
    Map<String, Object> resolution(UUID taskId);

    /** {@code decided_at < now() - interval '60 seconds'}, fencing a still-APPLYING run on restart. */
    boolean decisionOlderThan60s(UUID taskId);

    /** Rolling-deployment guard for the V5 audit columns. */
    boolean hasResolutionColumns();

    /** CAS: close an UNKNOWN run and its task projection with human evidence. */
    int resolveUnknown(UUID taskId, String expertId, String closedState, String expectedState, String note, String principal);

    /** CAS: project a reconciled state only while the run is still in the expected state. */
    int project(UUID taskId, String state, String expectedState);

    /** SELECT ... FOR UPDATE snapshot for one run owned by an expert. */
    Map<String, Object> lockRun(UUID taskId, String expertId);

    /** {@code approval_expires_at>now() AND expires_at>now()}. */
    boolean approvalValid(UUID taskId);

    /** Record the human decision on the run. */
    int decide(UUID taskId, String state, String decision, String principal);

    /** Project a decision to the task row. */
    int updateTask(UUID taskId, String status, String decision);

    /** Project a needs-review state to the task row. */
    int markTaskNeedsReview(UUID taskId, String status);

    /** Runs left in APPLYING at startup, for evidence-only reconciliation. */
    List<ApplyingRun> applyingRuns();
}
