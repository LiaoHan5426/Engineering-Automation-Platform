package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.BoardCodeProposalStore;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class JdbcBoardCodeProposalStore implements BoardCodeProposalStore {
    private static final String SELECT = """
        SELECT p.id,p.conversation_id,p.generation_id,g.task_revision,g.target_path,p.status,
               (p.proposal->>'writeAllowed')::boolean AS write_allowed,p.created_at,jsonb_array_length(p.proposal->'files') AS file_count
        FROM eap.code_proposal p JOIN eap.code_generation g ON g.id=p.generation_id
        WHERE g.task_id=? AND g.task_project_id=? AND g.workspace=? AND p.workspace=g.workspace
          AND g.principal=? AND p.principal=g.principal AND p.conversation_id=g.conversation_id
        """;
    private final JdbcTemplate jdbc;

    public JdbcBoardCodeProposalStore(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public List<Item> list(UUID taskId, String projectId, String workspace, String principal) {
        return jdbc.query(SELECT + " ORDER BY p.created_at DESC,p.id DESC LIMIT 21",
            (rs, row) -> new Item(
                rs.getObject("id", UUID.class), rs.getObject("conversation_id", UUID.class),
                rs.getObject("generation_id", UUID.class), rs.getLong("task_revision"),
                rs.getString("target_path"), rs.getString("status"), rs.getBoolean("write_allowed"),
                rs.getTimestamp("created_at").toInstant(), rs.getInt("file_count")),
            taskId, projectId, workspace, principal);
    }

    @Override
    public UUID findConversationId(UUID taskId, String projectId, String workspace, String principal, UUID proposalId) {
        var rows = jdbc.query(SELECT + " AND p.id=?",
            (rs, row) -> rs.getObject("conversation_id", UUID.class),
            taskId, projectId, workspace, principal, proposalId);
        return rows.isEmpty() ? null : rows.get(0);
    }
}
