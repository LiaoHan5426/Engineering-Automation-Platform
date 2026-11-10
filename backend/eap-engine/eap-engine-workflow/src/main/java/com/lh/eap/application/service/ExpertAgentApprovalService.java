package com.lh.eap.application.service;
import java.security.NoSuchAlgorithmException;
import com.lh.eap.core.ExpertAgentState;
import com.lh.eap.delivery.CodeProposalStatus;
import com.lh.eap.error.AgentErrors;

import com.lh.eap.core.*;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.config.RuntimeWorkspace;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Approval consumes an immutable candidate once. All filesystem effects stay in CodeChangeService. */
@Service
public class ExpertAgentApprovalService implements ExpertAgentWrites {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final String PRINCIPAL = RuntimeWorkspace.OPERATOR_LABEL;
    private final CodeChangeService changes;
    private final ExpertAgentJournal journal;
    private final ExpertAgentAccess access;
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public ExpertAgentApprovalService(CodeChangeService changes, ExpertAgentJournal journal, ExpertAgentAccess access,
                                      JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.changes = changes; this.journal = journal; this.access = access; this.jdbc = jdbc;
        this.tx = new TransactionTemplate(manager); this.tx.setTimeout(10);
    }
    @Override public UUID prepare(ExpertAgentJournal.Entry lease, String target) {
        journal.check(lease); access.check(lease.snapshot());
        if (target == null || !target.endsWith(".sql")) throw conflict(AgentErrors.AGENT_SQL_TARGET_REQUIRED.code());
        var baseline = changes.inspectBaseline(target);
        if (baseline.denial() != null && !baseline.denial().isBlank()) throw conflict(baseline.denial());
        return changes.prepareGeneration(PRINCIPAL, lease.id(), target, "", "").id();
    }
    @Override public UUID propose(ExpertAgentJournal.Entry lease, UUID generation, String target, String content) {
        journal.check(lease); access.check(lease.snapshot());
        String expected = JSON.readTree(lease.request()).path("targetPath").asString("");
        if (!expected.equals(target) || !target.endsWith(".sql") || content.isBlank() || content.length() > 6000)
            throw conflict(AgentErrors.AGENT_CANDIDATE_SCOPE_MISMATCH.code());
        var candidate = changes.proposePrepared(PRINCIPAL, lease.id(), generation,
                JSON.writeValueAsString(Map.of("summary", "Unverified SQL candidate", "files", List.of(Map.of("path", target, "content", content)))), true);
        String digest = digest(JSON.writeValueAsString(candidate) + ":" + lease.snapshot().revision());
        tx.executeWithoutResult(status -> {
            access.check(lease.snapshot());
            int changed = jdbc.update("""
                    UPDATE eap.expert_agent_run SET proposal_id=?,approval_digest=?,approval_expires_at=now()+interval '15 minutes',
                        checkpoint=checkpoint || jsonb_build_object('proposal',?::text,'terminal','awaiting-approval',
                        'summary','SQL candidate awaits human approval'),updated_at=now()
                    WHERE task_id=? AND owner=? AND state='running' AND lease_until>now() AND proposal_id IS NULL
                    """, candidate.id(), digest, candidate.id().toString(), lease.id(), lease.owner());
            if (changed != 1) throw conflict(AgentErrors.AGENT_CANDIDATE_ALREADY_BOUND_OR_LEASE_LOST.code());
        });
        return candidate.id();
    }

    public record Review(UUID proposalId, String digest, boolean approve) { }
    public Map<String,Object> inspect(String expert, UUID id) {
        journal.recoverExpired();
        var run = journal.get(expert, id);
        var approval = jdbc.queryForMap("SELECT proposal_id,approval_digest,approval_expires_at,decision,decided_by,decided_at FROM eap.expert_agent_run WHERE task_id=?", id);
        var result = new LinkedHashMap<String,Object>();
        result.put("run", run); result.put("approval", approval);
        if (approval.get("proposal_id") instanceof UUID proposal) {
            var candidate = changes.proposal(PRINCIPAL, id, proposal);
            // Reconcile evidence only. Never apply a proposal merely because the server restarted.
            if (Set.of(ExpertAgentState.APPLYING.wire(), ExpertAgentState.UNKNOWN.wire()).contains(run.state())) {
                String state = switch (candidate.status()) { case "APPLIED" -> ExpertAgentState.APPLIED.wire(); case "FAILED" -> ExpertAgentState.FAILED.wire(); default -> null; };
                if (state != null) project(id, state, run.state());
                else {
                    // A still-live approval may be writing; leave it fenced. On restart CodeChangeService marks APPLYING unknown.
                    if (candidate.status().equals(CodeProposalStatus.UNKNOWN.wire())) project(id, ExpertAgentState.UNKNOWN.wire(), ExpertAgentState.APPLYING.wire());
                    else if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT decided_at < now()-interval '60 seconds' FROM eap.expert_agent_run WHERE task_id=?", Boolean.class, id)))
                        project(id, ExpertAgentState.UNKNOWN.wire(), ExpertAgentState.APPLYING.wire());
                }
                result.put("run", journal.get(expert, id));
            }
            result.put("candidate", candidate);
        }
        return result;
    }
    public Map<String,Object> review(String expert, UUID id, Review review) {
        Objects.requireNonNull(review);
        journal.recoverExpired();
        var before = journal.get(expert, id);
        var scope = jdbc.queryForMap("SELECT proposal_id,approval_digest FROM eap.expert_agent_run WHERE task_id=?", id);
        if (review.proposalId() == null || review.digest() == null || !Objects.equals(scope.get("proposal_id"), review.proposalId())
                || !Objects.equals(scope.get("approval_digest"), review.digest())) throw conflict(AgentErrors.AGENT_APPROVAL_SCOPE_MISMATCH.code());
        if (Set.of(ExpertAgentState.APPLIED.wire(), ExpertAgentState.DENIED.wire(), ExpertAgentState.UNKNOWN.wire(), ExpertAgentState.FAILED.wire(), ExpertAgentState.EXPIRED.wire(), ExpertAgentState.CANCELLED.wire()).contains(before.state())) return inspect(expert, id);
        var proposal = tx.execute(status -> {
            var rows = jdbc.queryForList("SELECT * FROM eap.expert_agent_run WHERE task_id=? AND expert_id=? FOR UPDATE", id, expert);
            if (rows.isEmpty()) throw conflict(AgentErrors.AGENT_RUN_NOT_FOUND.code());
            var row = rows.getFirst();
            if (!ExpertAgentState.AWAITING_APPROVAL.wire().equals(row.get("state"))) throw conflict(AgentErrors.AGENT_NOT_AWAITING_APPROVAL.code());
            if (!Objects.equals(row.get("proposal_id"), review.proposalId()) || !Objects.equals(row.get("approval_digest"), review.digest()))
                throw conflict(AgentErrors.AGENT_APPROVAL_SCOPE_MISMATCH.code());
            if (review.approve()) {
                checkEvidence(before);
                if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT approval_expires_at>now() AND expires_at>now() FROM eap.expert_agent_run WHERE task_id=?", Boolean.class, id)))
                    throw conflict(AgentErrors.AGENT_APPROVAL_EXPIRED.code());
            }
            String state = review.approve() ? ExpertAgentState.APPLYING.wire() : ExpertAgentState.DENIED.wire();
            jdbc.update("UPDATE eap.expert_agent_run SET state=?,decision=?,decided_by=?,decided_at=now(),updated_at=now() WHERE task_id=?",
                    state, review.approve() ? "approved" : ExpertAgentState.DENIED.wire(), PRINCIPAL, id);
            jdbc.update("UPDATE eap.task SET status=?,decision=? WHERE id=?", state, review.approve() ? "needs-review" : "rejected", id);
            return (UUID) row.get("proposal_id");
        });
        if (!review.approve()) changes.refuse(PRINCIPAL, id, proposal);
        else {
            try {
                checkEvidence(before);
                changes.apply(PRINCIPAL, id, proposal, true);
                project(id, ExpertAgentState.APPLIED.wire(), ExpertAgentState.APPLYING.wire());
            } catch (RuntimeException failure) {
                var state = changes.proposal(PRINCIPAL, id, proposal).status();
                project(id, state.equals(CodeProposalStatus.FAILED.wire()) || state.equals(CodeProposalStatus.PROPOSED.wire()) ? ExpertAgentState.FAILED.wire() : state.equals(CodeProposalStatus.APPLIED.wire()) ? ExpertAgentState.APPLIED.wire() : ExpertAgentState.UNKNOWN.wire(), ExpertAgentState.APPLYING.wire());
                throw failure;
            }
        }
        return inspect(expert, id);
    }
    /** Reconcile durable evidence; stale approval intent is UNKNOWN, never replayed. */
    public void recoverInterruptedApprovals() {
        for (var row : jdbc.queryForList("SELECT task_id,expert_id FROM eap.expert_agent_run WHERE state='applying'")) {
            var id = (UUID) row.get("task_id");
            inspect((String) row.get("expert_id"), id);
        }
    }
    private void project(UUID id, String state, String expected) {
        tx.executeWithoutResult(status -> {
            if (jdbc.update("UPDATE eap.expert_agent_run SET state=?,updated_at=now() WHERE task_id=? AND state=?", state, id, expected) == 1)
                jdbc.update("UPDATE eap.task SET status=?,decision='needs-review' WHERE id=?", state, id);
        });
    }
    private void checkEvidence(ExpertAgentJournal.Entry run) {
        var checkpoint = JSON.readTree(run.checkpoint());
        var knowledge = new HashSet<UUID>(); var databases = new HashSet<UUID>();
        checkpoint.path("knowledgeGrants").forEach(id -> knowledge.add(UUID.fromString(id.asString())));
        checkpoint.path("databaseGrants").forEach(id -> databases.add(UUID.fromString(id.asString())));
        access.checkEvidence(run.snapshot(), knowledge, databases);
    }
    private static String digest(String text) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static ResponseStatusException conflict(String code) { return new ResponseStatusException(HttpStatus.CONFLICT, code); }
}
