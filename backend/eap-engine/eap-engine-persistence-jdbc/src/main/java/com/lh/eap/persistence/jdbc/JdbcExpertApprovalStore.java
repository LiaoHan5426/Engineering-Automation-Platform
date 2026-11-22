package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.ExpertApprovalStore;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** SQL only: every state decision and transaction remains in ExpertAgentApprovalService. */
@Repository
public class JdbcExpertApprovalStore implements ExpertApprovalStore {
    private final JdbcTemplate jdbc;

    public JdbcExpertApprovalStore(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Override
    public int bindCandidate(UUID taskId, UUID owner, UUID proposalId, String digest) {
        return jdbc.update("""
                UPDATE eap.expert_agent_run SET proposal_id=?,approval_digest=?,approval_expires_at=now()+interval '15 minutes',
                    checkpoint=checkpoint || jsonb_build_object('proposal',?::text,'terminal','awaiting-approval',
                    'summary','SQL candidate awaits human approval'),updated_at=now()
                WHERE task_id=? AND owner=? AND state='running' AND lease_until>now() AND proposal_id IS NULL
                """, proposalId, digest, proposalId.toString(), taskId, owner);
    }

    @Override
    public Map<String, Object> approval(UUID taskId) {
        return jdbc.queryForMap("SELECT proposal_id,approval_digest,approval_expires_at,decision,decided_by,decided_at FROM eap.expert_agent_run WHERE task_id=?", taskId);
    }

    @Override
    public Map<String, Object> resolution(UUID taskId) {
        return jdbc.queryForMap("SELECT resolution_note,resolution_operator,resolved_at FROM eap.expert_agent_run WHERE task_id=?", taskId);
    }

    @Override
    public boolean decisionOlderThan60s(UUID taskId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT decided_at < now()-interval '60 seconds' FROM eap.expert_agent_run WHERE task_id=?", Boolean.class, taskId));
    }

    @Override
    public boolean hasResolutionColumns() {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT count(*) = 3 FROM information_schema.columns
                 WHERE table_schema='eap' AND table_name='expert_agent_run'
                   AND column_name IN ('resolution_note','resolution_operator','resolved_at')
                """, Boolean.class));
    }

    @Override
    public int resolveUnknown(UUID taskId, String expertId, String closedState, String expectedState, String note, String principal) {
        return jdbc.update("""
                UPDATE eap.expert_agent_run
                   SET state=?,resolution_note=?,resolution_operator=?,resolved_at=now(),updated_at=now()
                 WHERE task_id=? AND expert_id=? AND state=?
                """, closedState, note, principal, taskId, expertId, expectedState);
    }

    @Override
    public int project(UUID taskId, String state, String expectedState) {
        return jdbc.update("UPDATE eap.expert_agent_run SET state=?,updated_at=now() WHERE task_id=? AND state=?", state, taskId, expectedState);
    }

    @Override
    public Map<String, Object> lockRun(UUID taskId, String expertId) {
        var rows = jdbc.queryForList("SELECT * FROM eap.expert_agent_run WHERE task_id=? AND expert_id=? FOR UPDATE", taskId, expertId);
        return rows.isEmpty() ? null : rows.getFirst();
    }

    @Override
    public boolean approvalValid(UUID taskId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT approval_expires_at>now() AND expires_at>now() FROM eap.expert_agent_run WHERE task_id=?", Boolean.class, taskId));
    }

    @Override
    public int decide(UUID taskId, String state, String decision, String principal) {
        return jdbc.update("UPDATE eap.expert_agent_run SET state=?,decision=?,decided_by=?,decided_at=now(),updated_at=now() WHERE task_id=?",
                state, decision, principal, taskId);
    }

    @Override
    public int updateTask(UUID taskId, String status, String decision) {
        return jdbc.update("UPDATE eap.task SET status=?,decision=? WHERE id=?", status, decision, taskId);
    }

    @Override
    public int markTaskNeedsReview(UUID taskId, String status) {
        return jdbc.update("UPDATE eap.task SET status=?,decision='needs-review' WHERE id=?", status, taskId);
    }

    @Override
    public List<ApplyingRun> applyingRuns() {
        return jdbc.query("SELECT task_id,expert_id FROM eap.expert_agent_run WHERE state='applying'",
                (rs, row) -> new ApplyingRun(rs.getObject("task_id", UUID.class), rs.getString("expert_id")));
    }
}
