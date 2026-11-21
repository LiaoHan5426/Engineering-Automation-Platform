package com.lh.eap.persistence.mapper;
import com.lh.eap.application.service.MissionExecutionStatus;

import com.lh.eap.application.service.MissionExecution;
import com.lh.eap.application.service.MissionExecutionStore;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class JdbcMissionExecutionStore implements MissionExecutionStore {
    private static final String SELECT_BASE = """
            SELECT id, mission_id, status, capability, principal, workspace_path, workspace_label, executable,
                   policy_snapshot, os_pid, process_started_at, process_user, process_executable, started_at,
                   finished_at, exit_code, stdout, stderr, exit_evidence, unconfirmed_reason, cancel_requested,
                   approval, created_at
            """;
    private static final String SELECT_AUDIT = ", resolution_note, resolution_operator, resolved_at";
    private static final String FROM = " FROM eap.mission_execution ";
    private final JdbcTemplate jdbc;
    private volatile Boolean auditColumnsPresent;

    public JdbcMissionExecutionStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * The resolution audit columns arrive in an incremental migration (V4). Some persistence tests
     * still bind this store to a baseline V1 schema. Detect once and omit the audit projection when
     * the columns are absent, so pre-existing reads keep working; the audit is only ever populated
     * on a fully migrated schema.
     */
    private boolean auditColumnsPresent() {
        var present = auditColumnsPresent;
        if (present == null) {
            synchronized (this) {
                present = auditColumnsPresent;
                if (present == null) {
                    Integer count = jdbc.queryForObject(
                            "SELECT count(*) FROM information_schema.columns "
                                    + "WHERE table_schema = 'eap' AND table_name = 'mission_execution' "
                                    + "AND column_name = 'resolution_note'", Integer.class);
                    auditColumnsPresent = present = count != null && count > 0;
                }
            }
        }
        return present;
    }

    private String select() {
        return SELECT_BASE + (auditColumnsPresent() ? SELECT_AUDIT : "") + FROM;
    }

    @Override
    @Transactional
    public void insertOpen(MissionExecution execution) {
        jdbc.update(
                """
                INSERT INTO eap.mission_execution(
                    id, mission_id, status, capability, principal, workspace_path, workspace_label, executable,
                    policy_snapshot, started_at, cancel_requested, approval, created_at)
                VALUES (?, ?, ?, 'git-status', 'local-operator', ?, ?, ?, ?, ?, false, 'NOT_REQUIRED', ?)
                """,
                execution.id(), execution.missionId(), MissionExecutionStatus.CREATED.wire(), execution.workspacePath(), execution.workspaceLabel(),
                execution.executable(), execution.policySnapshot(), Timestamp.from(execution.startedAt()),
                Timestamp.from(execution.createdAt()));
        project(execution.missionId(), "running");
    }

    @Override
    public boolean claimCreated(UUID id) {
        return jdbc.update("UPDATE eap.mission_execution SET status=? WHERE id=? AND status=? AND unconfirmed_reason IS NULL", MissionExecutionStatus.RUNNING.wire(), id, MissionExecutionStatus.CREATED.wire()) == 1;
    }

    @Override
    public Optional<MissionExecution> open(UUID missionId) {
        return jdbc.query(select() + " WHERE mission_id = ? AND status = ANY(?::text[])",
                (rs, row) -> map(rs), missionId, StateBindings.MISSION_ACTIVE).stream().findFirst();
    }

    @Override
    public Optional<MissionExecution> find(UUID id) {
        return jdbc.query(select() + " WHERE id = ?", (rs, row) -> map(rs), id).stream().findFirst();
    }

    @Override
    public List<MissionExecution> list(UUID missionId) {
        return jdbc.query(select() + " WHERE mission_id = ? ORDER BY created_at DESC", (rs, row) -> map(rs), missionId);
    }

    @Override
    public List<MissionExecution> openAll() {
        return jdbc.query(select() + " WHERE status = ANY(?::text[])", (rs, row) -> map(rs), StateBindings.MISSION_ACTIVE);
    }

    @Override
    @Transactional
    public void markCancelling(UUID id) {
        var mission = missionId(id);
        jdbc.update(
                "UPDATE eap.mission_execution SET status = ?, cancel_requested = true WHERE id = ? AND status = ANY(?::text[])",
                MissionExecutionStatus.CANCELLING.wire(), id, "{" + MissionExecutionStatus.CREATED.wire() + "," + MissionExecutionStatus.RUNNING.wire() + "}");
        project(mission, "cancelling");
    }

    @Override
    public void rememberProcess(UUID id, long pid, Instant startedAt, String user, String executable) {
        jdbc.update(
                """
                UPDATE eap.mission_execution
                SET status = CASE WHEN status = ? THEN ? ELSE status END,
                    os_pid = ?, process_started_at = ?, process_user = ?, process_executable = ?
                WHERE id = ? AND status = ANY(?::text[])
                """,
                MissionExecutionStatus.CREATED.wire(), MissionExecutionStatus.RUNNING.wire(), pid, startedAt == null ? null : Timestamp.from(startedAt), user, executable, id, StateBindings.MISSION_ACTIVE);
    }

    @Override
    @Transactional
    public void finish(UUID id, UUID missionId, String status, String projection, String evidence, Integer exitCode,
                       String stdout, String stderr, boolean cancelRequested) {
        jdbc.update(
                """
                UPDATE eap.mission_execution
                SET status = ?, finished_at = ?, exit_code = ?, stdout = ?, stderr = ?, exit_evidence = ?,
                    cancel_requested = ?, unconfirmed_reason = NULL
                WHERE id = ?
                """,
                status, Timestamp.from(Instant.now()), exitCode, stdout, stderr, evidence, cancelRequested, id);
        project(missionId, projection);
    }

    @Override
    public void unconfirmed(UUID id, String reason) {
        jdbc.update("UPDATE eap.mission_execution SET unconfirmed_reason = ? WHERE id = ?", reason, id);
    }

    @Override
    @Transactional
    public int resolveUnconfirmed(UUID id, String note, String operator, Instant resolvedAt) {
        var updated = jdbc.update(
                """
                UPDATE eap.mission_execution
                SET status = ?, resolution_note = ?, resolution_operator = ?, resolved_at = ?
                WHERE id = ? AND status = ANY(?::text[]) AND unconfirmed_reason IS NOT NULL
                  AND resolution_note IS NULL
                """,
                MissionExecutionStatus.CLOSED_UNCONFIRMED.wire(), note, operator, Timestamp.from(resolvedAt),
                id, StateBindings.MISSION_ACTIVE);
        // No projection to eap.mission.execution: a human review is not a successful run.
        return updated;
    }

    @Override
    @Transactional
    public void failSameRow(UUID id, UUID missionId, String reason) {
        jdbc.update(
                """
                UPDATE eap.mission_execution
                SET status = ?, finished_at = ?, stderr = ?, exit_evidence = ?
                WHERE id = ?
                """,
                MissionExecutionStatus.FAILED.wire(), Timestamp.from(Instant.now()), reason, "EXECUTOR_REJECTED", id);
        project(missionId, "failed");
    }

    private void project(UUID missionId, String projection) {
        jdbc.update("UPDATE eap.mission SET execution = ? WHERE id = ?", projection, missionId);
    }

    private UUID missionId(UUID id) {
        return jdbc.queryForObject("SELECT mission_id FROM eap.mission_execution WHERE id = ?", UUID.class, id);
    }

    private MissionExecution map(ResultSet rs) throws SQLException {
        return new MissionExecution(
                rs.getObject("id", UUID.class),
                rs.getObject("mission_id", UUID.class),
                rs.getString("status"),
                rs.getString("capability"),
                rs.getString("principal"),
                rs.getString("workspace_path"),
                rs.getString("workspace_label"),
                rs.getString("executable"),
                rs.getString("policy_snapshot"),
                (Long) rs.getObject("os_pid"),
                instant(rs, "process_started_at"),
                rs.getString("process_user"),
                rs.getString("process_executable"),
                instant(rs, "started_at"),
                instant(rs, "finished_at"),
                (Integer) rs.getObject("exit_code"),
                rs.getString("stdout"),
                rs.getString("stderr"),
                rs.getString("exit_evidence"),
                rs.getString("unconfirmed_reason"),
                rs.getBoolean("cancel_requested"),
                rs.getString("approval"),
                instant(rs, "created_at"),
                auditColumnsPresent() ? resolution(rs) : null);
    }

    private static MissionExecution.Resolution resolution(ResultSet rs) throws SQLException {
        var note = rs.getString("resolution_note");
        return note == null ? null : new MissionExecution.Resolution(
                rs.getObject("id", UUID.class), note, rs.getString("resolution_operator"),
                instant(rs, "resolved_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        var timestamp = rs.getTimestamp(column);
        return timestamp == null ? null : timestamp.toInstant();
    }
}
