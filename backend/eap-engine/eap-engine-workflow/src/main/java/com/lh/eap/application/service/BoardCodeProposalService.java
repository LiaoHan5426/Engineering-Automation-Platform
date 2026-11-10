package com.lh.eap.application.service;
import com.lh.eap.error.WorkspaceErrors;
import com.lh.eap.delivery.CodeProposalStatus;
import com.lh.eap.error.BoardErrors;

import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.CodeChangeService;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/** Persistent task-owned review. Chat memory is neither a prerequisite nor an authority. */
@Service
public final class BoardCodeProposalService {
    public record Item(UUID id, UUID conversationId, UUID generationId, long taskRevision,
                       String targetPath, String status, boolean writeAllowed, Instant createdAt, int fileCount) {}
    public record Page(UUID taskId, String projectId, long currentRevision, String workspacePath,
                       List<Item> items, boolean truncated) {}
    public record Action(String projectId, long revision, boolean confirmed) {}
    private final BoardTaskService tasks;
    private final JdbcTemplate jdbc;
    private final RuntimeWorkspace runtime;
    private final CodeChangeService changes;
    private static final String SELECT = """
        SELECT p.id,p.conversation_id,p.generation_id,g.task_revision,g.target_path,p.status,
               (p.proposal->>'writeAllowed')::boolean AS write_allowed,p.created_at,jsonb_array_length(p.proposal->'files') AS file_count
        FROM eap.code_proposal p JOIN eap.code_generation g ON g.id=p.generation_id
        WHERE g.task_id=? AND g.task_project_id=? AND g.workspace=? AND p.workspace=g.workspace
          AND g.principal=? AND p.principal=g.principal AND p.conversation_id=g.conversation_id
        """;
    public BoardCodeProposalService(BoardTaskService tasks, JdbcTemplate jdbc, RuntimeWorkspace runtime, CodeChangeService changes) {
        this.tasks=tasks;this.jdbc=jdbc;this.runtime=runtime;this.changes=changes;
    }
    public Page list(UUID taskId, String projectId) {
        var task=tasks.find(taskId, projectId, false);var workspace=workspace();
        var rows=jdbc.query(SELECT+" ORDER BY p.created_at DESC,p.id DESC LIMIT 21",(rs,n)->new Item(
            rs.getObject("id",UUID.class),rs.getObject("conversation_id",UUID.class),rs.getObject("generation_id",UUID.class),
            rs.getLong("task_revision"),rs.getString("target_path"),rs.getString("status"),rs.getBoolean("write_allowed"),rs.getTimestamp("created_at").toInstant(),rs.getInt("file_count")),
            task.id(),task.projectId(),workspace,RuntimeWorkspace.OPERATOR_LABEL);
        return new Page(task.id(),task.projectId(),task.revision(),workspace,List.copyOf(rows.subList(0,Math.min(20,rows.size()))),rows.size()>20);
    }
    public CodeChangeService.ProposalStatus get(UUID taskId, UUID proposalId, String projectId) {
        tasks.find(taskId,projectId,false);
        UUID conversation=conversation(taskId,proposalId,projectId);
        var state=changes.proposal(RuntimeWorkspace.OPERATOR_LABEL,conversation,proposalId);
        var binding=state.proposal().generation()==null?null:state.proposal().generation().taskBinding();
        if(binding==null||!taskId.equals(binding.taskId())||!projectId.equals(binding.projectId())||!workspace().equals(state.proposal().workspace()))
            throw denied(HttpStatus.NOT_FOUND,BoardErrors.BOARD_CODE_PROPOSAL_NOT_FOUND.code());
        return state;
    }
    public CodeChangeService.Applied apply(UUID taskId, UUID proposalId, Action action) {
        var state=action(taskId,proposalId,action,true);
        return changes.apply(RuntimeWorkspace.OPERATOR_LABEL,state.proposal().conversationId(),proposalId,true);
    }
    public CodeChangeService.ProposalStatus refuse(UUID taskId, UUID proposalId, Action action) {
        var state=action(taskId,proposalId,action,false);
        if(state.status().equals(CodeProposalStatus.REFUSED.wire())) return state;
        return changes.refuse(RuntimeWorkspace.OPERATOR_LABEL,state.proposal().conversationId(),proposalId);
    }
    private CodeChangeService.ProposalStatus action(UUID taskId,UUID proposalId,Action action,boolean applying) {
        if(action==null||action.projectId()==null||action.projectId().isBlank()||action.revision()<1||!action.confirmed())
            throw denied(HttpStatus.BAD_REQUEST,BoardErrors.BOARD_CODE_CONFIRMATION_REQUIRED.code());
        var task=tasks.find(taskId,action.projectId(),false);var state=get(taskId,proposalId,action.projectId());
        if(task.revision()!=action.revision())throw denied(HttpStatus.CONFLICT,BoardErrors.BOARD_REVISION_CONFLICT.code());
        // Persisted terminal replay never reclaims an intent. A new apply still uses the original
        // task/workspace lock ordering and validates the entire immutable task snapshot in claim().
        if(applying && state.status().equals(CodeProposalStatus.PROPOSED.wire()) && state.proposal().generation().taskBinding().revision()!=task.revision())
            throw denied(HttpStatus.CONFLICT,BoardErrors.BOARD_CODE_PROPOSAL_STALE.code());
        return state;
    }
    private UUID conversation(UUID taskId,UUID proposalId,String projectId) {
        var rows=jdbc.query(SELECT+" AND p.id=?",(rs,n)->rs.getObject("conversation_id",UUID.class),
            taskId,projectId,workspace(),RuntimeWorkspace.OPERATOR_LABEL,proposalId);
        if(rows.size()!=1)throw denied(HttpStatus.NOT_FOUND,BoardErrors.BOARD_CODE_PROPOSAL_NOT_FOUND.code());return rows.getFirst();
    }
    private String workspace() {
        try {return runtime.workspace().toRealPath().toString();}
        catch(IOException|RuntimeException unavailable){throw denied(HttpStatus.CONFLICT,WorkspaceErrors.WORKSPACE_CHANGED.code());}
    }
    private static ResponseStatusException denied(HttpStatus status,String reason){return new ResponseStatusException(status,reason);}
}
