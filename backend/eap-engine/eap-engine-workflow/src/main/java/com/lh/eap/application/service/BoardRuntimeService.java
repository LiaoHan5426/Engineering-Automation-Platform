package com.lh.eap.application.service;
import com.lh.eap.delivery.CodeProposalStatus;
import com.lh.eap.persistence.mapper.StateBindings;
import com.lh.eap.error.BoardErrors;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** One database snapshot of existing board state; never probes executors, dispatches or changes work. */
@Service
public class BoardRuntimeService {
    public record Activity(UUID taskId, UUID id, String kind, String status, String storedStatus) {
        public Activity {
            boolean valid = switch (kind) {
                case "RUN" -> MissionExecutionStatus.fromWire(status).blocking() && MissionExecutionStatus.isKnown(storedStatus);
                case "VERIFICATION" -> BoardVerificationStatus.fromWire(status).blocking() && BoardVerificationStatus.isKnown(storedStatus);
                case "SOURCE_WRITE" -> CodeProposalStatus.fromWire(status).blocking() && CodeProposalStatus.isKnown(storedStatus);
                default -> false;
            };
            if (!valid) throw new IllegalArgumentException("INVALID_BOARD_RUNTIME_STATE");
        }
    }
    public record Snapshot(String projectId, Instant observedAt, long taskCount, long runCount,
            long activeRunCount, long unknownRunCount, long activeVerificationCount, long unknownVerificationCount,
            long activeWriteCount, long unknownWriteCount, List<Activity> items, boolean truncated) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    public BoardRuntimeService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Snapshot inspect(String projectId) {
        if (projectId == null || projectId.isBlank() || projectId.length() > 120)
            throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_FIELD.code());
        // A single statement gives counts and the bounded activity list the same PostgreSQL snapshot.
        return jdbc.queryForObject("""
                WITH states AS (SELECT ?::text[] AS mission_active, ?::text[] AS mission_blocking,
                    ?::text[] AS verification_blocking, ?::text[] AS code_blocking,
                    ?::text AS mission_unknown, ?::text AS verification_unknown, ?::text AS code_unknown),
                scoped_tasks AS (SELECT id FROM eap.board_task WHERE project_id=?),
                scoped_runs AS (
                    SELECT r.*, e.status AS stored_status, CASE WHEN e.status = ANY((SELECT mission_active FROM states)::text[])
                        AND NULLIF(btrim(e.unconfirmed_reason),'') IS NOT NULL THEN (SELECT mission_unknown FROM states) ELSE e.status END AS execution_status FROM eap.board_task_run r
                    JOIN scoped_tasks t ON t.id=r.task_id JOIN eap.mission_execution e ON e.id=r.execution_id
                ), work AS (
                    SELECT task_id, execution_id AS id, 'RUN' AS kind, execution_status AS status, stored_status FROM scoped_runs
                    WHERE execution_status = ANY((SELECT mission_blocking FROM states)::text[])
                    UNION ALL
                    SELECT task_id, execution_id, 'VERIFICATION', verification_snapshot->>'status', verification_snapshot->>'status' FROM scoped_runs
                    WHERE verification_snapshot->>'status' = ANY((SELECT verification_blocking FROM states)::text[])
                    UNION ALL
                    SELECT g.task_id, p.id, 'SOURCE_WRITE', p.status, p.status FROM eap.code_proposal p
                    JOIN eap.code_generation g ON g.id=p.generation_id JOIN scoped_tasks t ON t.id=g.task_id
                    WHERE p.status = ANY((SELECT code_blocking FROM states)::text[])
                ), limited AS (SELECT * FROM work ORDER BY ((kind='RUN' AND status=(SELECT mission_unknown FROM states) OR kind='VERIFICATION' AND status=(SELECT verification_unknown FROM states) OR kind='SOURCE_WRITE' AND status=(SELECT code_unknown FROM states))) DESC, kind, task_id, id LIMIT 20)
                SELECT (SELECT count(*) FROM scoped_tasks) AS tasks, (SELECT count(*) FROM scoped_runs) AS runs,
                    count(*) FILTER (WHERE kind='RUN' AND status<>(SELECT mission_unknown FROM states)) AS active_runs,
                    count(*) FILTER (WHERE kind='RUN' AND status=(SELECT mission_unknown FROM states)) AS unknown_runs,
                    count(*) FILTER (WHERE kind='VERIFICATION' AND status<>(SELECT verification_unknown FROM states)) AS active_verifications,
                    count(*) FILTER (WHERE kind='VERIFICATION' AND status=(SELECT verification_unknown FROM states)) AS unknown_verifications,
                    count(*) FILTER (WHERE kind='SOURCE_WRITE' AND status<>(SELECT code_unknown FROM states)) AS active_writes,
                    count(*) FILTER (WHERE kind='SOURCE_WRITE' AND status=(SELECT code_unknown FROM states)) AS unknown_writes,
                    count(*)>20 AS truncated,
                    COALESCE((SELECT jsonb_agg(jsonb_build_object('taskId',task_id,'id',id,'kind',kind,'status',status,'storedStatus',stored_status)
                        ORDER BY ((kind='RUN' AND status=(SELECT mission_unknown FROM states) OR kind='VERIFICATION' AND status=(SELECT verification_unknown FROM states) OR kind='SOURCE_WRITE' AND status=(SELECT code_unknown FROM states))) DESC,kind,task_id,id) FROM limited),'[]'::jsonb)::text AS items
                FROM work
                """, (rs, row) -> new Snapshot(projectId, Instant.now(), rs.getLong("tasks"), rs.getLong("runs"),
                rs.getLong("active_runs"), rs.getLong("unknown_runs"), rs.getLong("active_verifications"),
                rs.getLong("unknown_verifications"), rs.getLong("active_writes"), rs.getLong("unknown_writes"),
                List.copyOf(Arrays.asList(JSON.readValue(rs.getString("items"), Activity[].class))), rs.getBoolean("truncated")), StateBindings.MISSION_ACTIVE, StateBindings.MISSION_BLOCKING,
                StateBindings.VERIFICATION_BLOCKING, StateBindings.CODE_BLOCKING, MissionExecutionStatus.UNKNOWN.wire(),
                BoardVerificationStatus.UNKNOWN.wire(), CodeProposalStatus.UNKNOWN.wire(), projectId);
    }
}
