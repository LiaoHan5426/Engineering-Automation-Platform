package com.lh.eap.persistence.jdbc;

import com.lh.eap.api.TaskRef;
import com.lh.eap.core.BoardApplicationCatalogQuery;
import com.lh.eap.domain.model.CodeProposalStatus;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JdbcBoardApplicationCatalogQuery implements BoardApplicationCatalogQuery {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;

    public JdbcBoardApplicationCatalogQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public Page list(TaskRef task, String workspace, String principal) {
        var rows = jdbc.query("""
            SELECT p.conversation_id, p.id, g.id AS generation_id, g.target_path,
                   p.result->>'afterHash' AS after_hash, p.finished_at,p.result->'written' AS written
            FROM eap.code_generation g JOIN eap.code_proposal p ON p.generation_id=g.id
            WHERE g.task_project_id=? AND g.task_id=? AND g.task_revision=?
              AND g.workspace=? AND p.workspace=g.workspace
              AND g.principal=? AND p.principal=g.principal AND p.conversation_id=g.conversation_id
              AND p.status=? AND p.result->>'status'=?
              AND p.finished_at IS NOT NULL AND p.started_at IS NOT NULL
              AND p.result->>'id'=p.id::text
              AND p.result->'written'->>0=g.target_path
              AND jsonb_array_length(p.result->'written')=jsonb_array_length(p.proposal->'files')
              AND p.proposal->'generation'->>'id'=g.id::text
              AND p.proposal->'generation'->'taskBinding'=jsonb_build_object(
                  'projectId',g.task_project_id,'taskId',g.task_id,'revision',g.task_revision)
            ORDER BY p.finished_at DESC,p.id DESC LIMIT 21
            """, (rs, index) -> new Item(rs.getObject("conversation_id", java.util.UUID.class),
                rs.getObject("id", java.util.UUID.class), rs.getObject("generation_id", java.util.UUID.class),
                rs.getString("target_path"), rs.getString("after_hash"), rs.getTimestamp("finished_at").toInstant(),
                List.of(JSON.readValue(rs.getString("written"), String[].class))),
                task.projectId(), task.taskId(), task.revision(), workspace, principal,
                CodeProposalStatus.APPLIED.wire(), CodeProposalStatus.APPLIED.wire());
        return new Page(task, workspace, List.copyOf(rows.subList(0, Math.min(rows.size(), 20))), rows.size() > 20);
    }
}
