package com.lh.eap.persistence.mapper;

import com.lh.eap.api.Observation;
import com.lh.eap.core.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Every mutation is a short transaction; owner tokens fence late workers from another attempt. */
@Repository
@Transactional(timeout = 10)
public class JdbcExpertAgentJournal implements ExpertAgentJournal {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final TaskRepository tasks;
    private final ExpertAgentAccess access;
    public JdbcExpertAgentJournal(JdbcTemplate jdbc, TaskRepository tasks, ExpertAgentAccess access) {
        this.jdbc = jdbc; this.tasks = tasks; this.access = access;
    }
    public void create(UUID id, ExpertAgentAccess.Snapshot snapshot, String request, String goal) {
        create(id, snapshot, request, goal, false);
    }
    private void create(UUID id, ExpertAgentAccess.Snapshot snapshot, String request, String goal, boolean automatic) {
        access.check(snapshot);
        if (!tasks.startAgent(id, goal)) throw conflict("EXECUTION_ID_ALREADY_USED");
        jdbc.update("INSERT INTO eap.expert_agent_run(task_id,expert_id,snapshot,request,automatic) VALUES (?,?,?::jsonb,?::jsonb,?)",
                id, snapshot.manifest().id(), JSON.writeValueAsString(snapshot), request, automatic);
        jdbc.update("UPDATE eap.task SET status='queued' WHERE id=?", id);
    }
    public Entry enqueue(UUID id, ExpertAgentAccess.Snapshot snapshot, String request, String goal) {
        // Bound admission across processes. This lock is held only during the short enqueue transaction.
        jdbc.execute("SELECT pg_advisory_xact_lock(1751210021)");
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM eap.task WHERE id=?)", Boolean.class, id))) {
            var previous = get(snapshot.manifest().id(), id);
            if (!previous.automatic() || !JSON.readTree(previous.request()).equals(JSON.readTree(request)))
                throw conflict("EXECUTION_ID_ALREADY_USED");
            return previous;
        }
        recoverExpired();
        if (jdbc.queryForObject("SELECT count(*) FROM eap.expert_agent_run WHERE automatic AND state IN ('queued','running','interrupted')", Integer.class) >= 100)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "AGENT_QUEUE_FULL");
        create(id, snapshot, request, goal, true);
        return get(snapshot.manifest().id(), id);
    }
    public List<Pending> pending(int limit) {
        return jdbc.query("SELECT task_id,expert_id,attempts FROM eap.expert_agent_run WHERE automatic AND state IN ('queued','interrupted') AND attempts<3 AND expires_at>now() ORDER BY updated_at,task_id LIMIT ?",
                (rs, n) -> new Pending(rs.getObject("task_id", UUID.class), rs.getString("expert_id"), rs.getInt("attempts")), Math.clamp(limit, 1, 4));
    }
    public List<Summary> list(int limit) {
        return jdbc.query("SELECT task_id,expert_id,snapshot#>>'{manifest,name}' AS expert_name,state,attempts,automatic,created_at,updated_at,expires_at FROM eap.expert_agent_run ORDER BY created_at DESC,task_id LIMIT ?",
                (rs, n) -> new Summary(rs.getObject("task_id", UUID.class), rs.getString("expert_id"), rs.getString("expert_name"),
                        rs.getString("state"), rs.getInt("attempts"), rs.getBoolean("automatic"), rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("updated_at").toInstant(), rs.getTimestamp("expires_at").toInstant()), Math.clamp(limit, 1, 100));
    }
    public void failPending(Pending pending, String error) {
        if (jdbc.update("UPDATE eap.expert_agent_run SET state='failed',result=?::jsonb,updated_at=now() WHERE task_id=? AND expert_id=? AND automatic AND state IN ('queued','interrupted') AND attempts=?",
                JSON.writeValueAsString(Map.of("status", "failed", "error", error, "verification", "unverified")), pending.id(), pending.expertId(), pending.attempts()) == 1)
            jdbc.update("UPDATE eap.task SET status='failed',decision='needs-review' WHERE id=?", pending.id());
    }
    public Entry get(String expertId, UUID id) {
        var rows = jdbc.query("SELECT * FROM eap.expert_agent_run WHERE task_id=? AND expert_id=?", (rs, n) ->
                new Entry(id, JSON.readValue(rs.getString("snapshot"), ExpertAgentAccess.Snapshot.class), rs.getString("request"),
                        rs.getString("checkpoint"), rs.getString("state"), rs.getInt("attempts"), rs.getObject("owner", UUID.class),
                        rs.getTimestamp("lease_until") == null ? null : rs.getTimestamp("lease_until").toInstant(),
                        rs.getTimestamp("expires_at").toInstant(), rs.getString("result"), rs.getBoolean("automatic")), id, expertId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "AGENT_RUN_NOT_FOUND");
        return rows.getFirst();
    }
    public Entry claim(String expertId, UUID id) {
        recoverExpired();
        var saved = get(expertId, id);
        access.check(saved.snapshot());
        var owner = UUID.randomUUID();
        int changed = jdbc.update("""
                UPDATE eap.expert_agent_run SET state='running',owner=?,lease_until=now()+interval '60 seconds',
                    attempts=attempts+1,result=NULL,updated_at=now()
                WHERE task_id=? AND expert_id=? AND state IN ('queued','interrupted') AND attempts<3 AND expires_at>now()
                """, owner, id, expertId);
        if (changed != 1) throw conflict("AGENT_RUN_NOT_RESUMABLE");
        jdbc.update("UPDATE eap.task SET status='running' WHERE id=?", id);
        return get(expertId, id);
    }
    public void check(Entry lease) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM eap.expert_agent_run WHERE task_id=? AND owner=? AND state='running' AND lease_until>now() AND expires_at>now())",
                Boolean.class, lease.id(), lease.owner()))) throw conflict("AGENT_LEASE_LOST");
    }
    public void checkpoint(Entry lease, String checkpoint) {
        if (checkpoint.length() > 200000) throw conflict("AGENT_CHECKPOINT_LIMIT");
        int changed = jdbc.update("UPDATE eap.expert_agent_run SET checkpoint=?::jsonb,updated_at=now() WHERE task_id=? AND owner=? AND state='running' AND lease_until>now() AND expires_at>now()",
                checkpoint, lease.id(), lease.owner());
        if (changed != 1) throw conflict("AGENT_LEASE_LOST");
    }
    public void finish(Entry lease, String state, String result, String modelState, List<Observation> observations) {
        int changed = jdbc.update("UPDATE eap.expert_agent_run SET state=?,result=?::jsonb,owner=NULL,lease_until=NULL,updated_at=now() WHERE task_id=? AND owner=? AND state='running' AND lease_until>now()",
                state, result, lease.id(), lease.owner());
        if (changed != 1) throw conflict("AGENT_LEASE_LOST");
        if (state.equals("interrupted")) jdbc.update("UPDATE eap.task SET status='interrupted' WHERE id=?", lease.id());
        else if (!tasks.finishAgent(lease.id(), state, modelState, observations)) throw conflict("EXECUTION_ALREADY_FINISHED");
    }
    public boolean cancel(String expertId, UUID id) {
        get(expertId, id);
        int changed = jdbc.update("UPDATE eap.expert_agent_run SET state='cancelled',owner=NULL,lease_until=NULL,updated_at=now() WHERE task_id=? AND expert_id=? AND state IN ('queued','running','interrupted','awaiting-approval')", id, expertId);
        if (changed == 1) jdbc.update("UPDATE eap.task SET status='cancelled',decision='needs-review' WHERE id=?", id);
        return changed == 1;
    }
    public void recoverExpired() {
        var expired = jdbc.queryForList("""
                UPDATE eap.expert_agent_run SET state='expired',owner=NULL,lease_until=NULL,updated_at=now()
                WHERE (state IN ('queued','running','interrupted','awaiting-approval') AND expires_at<=now())
                   OR (state='awaiting-approval' AND approval_expires_at<=now()) RETURNING task_id
                """, UUID.class);
        for (var id : expired) jdbc.update("UPDATE eap.task SET status='expired',decision='needs-review' WHERE id=?", id);
        var ids = jdbc.queryForList("""
                UPDATE eap.expert_agent_run SET state='interrupted',owner=NULL,lease_until=NULL,updated_at=now()
                WHERE state='running' AND lease_until<=now() RETURNING task_id
                """, UUID.class);
        for (var id : ids) jdbc.update("UPDATE eap.task SET status='interrupted' WHERE id=? AND status='running'", id);
        var exhausted = jdbc.queryForList("UPDATE eap.expert_agent_run SET state='failed',result=jsonb_build_object('status','failed','error','AGENT_ATTEMPT_LIMIT'),updated_at=now() WHERE automatic AND state='interrupted' AND attempts>=3 RETURNING task_id", UUID.class);
        for (var id : exhausted) jdbc.update("UPDATE eap.task SET status='failed',decision='needs-review' WHERE id=?", id);
    }
    private static ResponseStatusException conflict(String code) { return new ResponseStatusException(HttpStatus.CONFLICT, code); }
}
