package com.lh.eap.application.service;

import com.lh.eap.api.TaskRef;
import com.lh.eap.config.RuntimeWorkspace;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/** Bounded, read-only discovery. Selection does not bypass delivery's source/time/snapshot checks. */
public final class BoardApplicationCatalog {
    public record Item(UUID conversationId, UUID proposalId, UUID generationId, String targetPath,
                String afterHash, Instant appliedAt) {}
    public record Page(TaskRef taskBinding, String workspacePath, List<Item> items, boolean truncated) {}
    private final JdbcTemplate jdbc;
    public BoardApplicationCatalog(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public Page list(TaskRef task, String workspace) {
        var rows = jdbc.query("""
            SELECT p.conversation_id, p.id, g.id AS generation_id, g.target_path,
                   p.result->>'afterHash' AS after_hash, p.finished_at
            FROM eap.code_generation g JOIN eap.code_proposal p ON p.generation_id=g.id
            WHERE g.task_project_id=? AND g.task_id=? AND g.task_revision=?
              AND g.workspace=? AND p.workspace=g.workspace
              AND g.principal=? AND p.principal=g.principal AND p.conversation_id=g.conversation_id
              AND p.status='APPLIED' AND p.result->>'status'='APPLIED'
              AND p.finished_at IS NOT NULL AND p.started_at IS NOT NULL
              AND p.result->>'id'=p.id::text
              AND p.result->'written'=jsonb_build_array(g.target_path)
              AND p.proposal->'generation'->>'id'=g.id::text
              AND p.proposal->'generation'->'taskBinding'=jsonb_build_object(
                  'projectId',g.task_project_id,'taskId',g.task_id,'revision',g.task_revision)
            ORDER BY p.finished_at DESC,p.id DESC LIMIT 21
            """, (rs, index) -> new Item(rs.getObject("conversation_id", UUID.class),
                rs.getObject("id", UUID.class), rs.getObject("generation_id", UUID.class),
                rs.getString("target_path"), rs.getString("after_hash"), rs.getTimestamp("finished_at").toInstant()),
                task.projectId(), task.taskId(), task.revision(), workspace, RuntimeWorkspace.OPERATOR_LABEL);
        return new Page(task, workspace, List.copyOf(rows.subList(0, Math.min(rows.size(), 20))), rows.size()>20);
    }
}
