package com.lh.eap.delivery;
import com.lh.eap.application.service.BoardCodeTaskBinding;
import com.lh.eap.application.service.BoardTaskService;
import com.lh.eap.application.service.WorkspaceInterlock;
import com.lh.eap.persistence.mapper.JdbcPrototypeVersionStore;
import java.util.function.Supplier;
import java.sql.ResultSet;
import java.sql.SQLException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.error.CodeErrors;
import com.lh.eap.delivery.CodeProposalStore;
import com.lh.eap.delivery.JdbcCodeGenerationStore;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.delivery.CodeGenerationStore;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

@Repository
public class JdbcCodeProposalStore implements CodeProposalStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    private final TransactionTemplate nonTransactional;
    private final CodeGenerationStore generations;
    private final BoardCodeTaskBinding tasks;
    public JdbcCodeProposalStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this(jdbc, manager, new JdbcCodeGenerationStore(jdbc, manager),
                new BoardCodeTaskBinding(new BoardTaskService(jdbc),
                        new JdbcPrototypeVersionStore(jdbc)));
    }
    @Autowired
    public JdbcCodeProposalStore(JdbcTemplate jdbc, PlatformTransactionManager manager, CodeGenerationStore generations,
                                 BoardCodeTaskBinding tasks) {
        this.jdbc = jdbc;
        this.generations = generations; this.tasks = tasks;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setTimeout(10);
        nonTransactional = new TransactionTemplate(manager);
        nonTransactional.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
    }
    @Override public <T> T withoutTransaction(Supplier<T> action) {
        return nonTransactional.execute(tx -> action.get());
    }
    @Override public void save(String principal, CodeChangeService.Proposal proposal) {
        transaction.executeWithoutResult(tx -> {
            if (proposal.generation() == null) throw new IllegalArgumentException("generation required");
            var snapshot=generations.find(proposal.generation().id()).orElseThrow();
            if(!snapshot.reference().equals(proposal.generation())||proposal.files().size()!=snapshot.sources().size())throw new IllegalArgumentException("generation scope mismatch");
            for(int i=0;i<snapshot.sources().size();i++) {
                var source=snapshot.sources().get(i);var change=proposal.files().get(i);
                if(!source.path().equals(change.path())||!source.baseHash().equals(change.baseHash())||!Objects.equals(source.content(),change.before()))throw new IllegalArgumentException("generation scope mismatch");
            }
            ComponentGraph.validate(snapshot.targetPath(),proposal.files());
            var file = proposal.files().getFirst();
            int saved = jdbc.update("""
                INSERT INTO eap.code_proposal(id,generation_id,principal,conversation_id,workspace,proposal)
                SELECT ?,id,principal,conversation_id,workspace,?::jsonb FROM eap.code_generation
                WHERE id=? AND principal=? AND conversation_id=? AND workspace=?
                  AND target_path=? AND base_hash=? AND source_content IS NOT DISTINCT FROM ?
                """, proposal.id(), JSON.writeValueAsString(proposal), proposal.generation().id(), principal,
                    proposal.conversationId(), proposal.workspace(), file.path(), file.baseHash(), file.before());
            if (saved != 1) throw new IllegalArgumentException("generation scope mismatch");
        });
    }
    @Override public Optional<Stored> find(String principal, UUID conversation, UUID id) {
        return jdbc.query("SELECT * FROM eap.code_proposal WHERE id=? AND principal=? AND conversation_id=?", (rs, row) ->
                new Stored(rs.getString("principal"), JSON.readValue(rs.getString("proposal"), CodeChangeService.Proposal.class),
                        rs.getString("status"), rs.getString("result") == null ? null : JSON.readValue(rs.getString("result"), CodeChangeService.Applied.class),
                        rs.getString("reason"), rs.getTimestamp("started_at") == null ? null : rs.getTimestamp("started_at").toInstant(),
                        rs.getTimestamp("finished_at") == null ? null : rs.getTimestamp("finished_at").toInstant()), id, principal, conversation).stream().findFirst();
    }
    @Override public boolean claim(String principal, UUID conversation, UUID id) {
        return Boolean.TRUE.equals(transaction.execute(tx -> {
            var row = find(principal, conversation, id).orElseThrow();
            if (!row.status().equals(CodeProposalStatus.PROPOSED.wire())) return false;
            // Derive the lock from immutable source evidence, not a caller/summary-selected task.
            var generation = generations.find(row.proposal().generation().id()).orElseThrow();
            var binding = generation.taskSnapshot();
            if (binding != null) tasks.lock(binding.binding());
            var workspace = row.proposal().workspace();
            WorkspaceInterlock.lock(jdbc, workspace);
            row = find(principal, conversation, id).orElseThrow();
            if (!row.status().equals(CodeProposalStatus.PROPOSED.wire())) return false;
            if (binding != null) tasks.validateLocked(binding);
            if (WorkspaceInterlock.codeActive(jdbc, workspace)
                    || WorkspaceInterlock.boardActive(jdbc, workspace))
                throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.CODE_WORKSPACE_BUSY.code());
            return jdbc.update("UPDATE eap.code_proposal SET status=?,started_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status=?",
                    CodeProposalStatus.APPLYING.wire(), id, principal, conversation, CodeProposalStatus.PROPOSED.wire()) == 1;
        }));
    }
    @Override public void recoverInterrupted(String workspace) {
        transaction.executeWithoutResult(tx -> {
            WorkspaceInterlock.lock(jdbc, workspace);
            jdbc.update("UPDATE eap.code_proposal SET status=?,reason=? WHERE lower(workspace)=lower(?) AND status=?", CodeProposalStatus.UNKNOWN.wire(), CodeErrors.CODE_APPLICATION_INTERRUPTED.code(), workspace, CodeProposalStatus.APPLYING.wire());
        });
    }
    @Override public void finish(String principal, UUID conversation, UUID id, String status, CodeChangeService.Applied result, String reason) {
        if (!Set.of(CodeProposalStatus.APPLIED.wire(), CodeProposalStatus.FAILED.wire(), CodeProposalStatus.UNKNOWN.wire()).contains(status)) throw new IllegalArgumentException("invalid result status");
        transaction.executeWithoutResult(tx -> {
            if (jdbc.update("UPDATE eap.code_proposal SET status=?,result=?::jsonb,reason=?,finished_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status=?",
                    status, result == null ? null : JSON.writeValueAsString(result), reason, id, principal, conversation, CodeProposalStatus.APPLYING.wire()) != 1)
                throw new IllegalStateException("proposal claim lost");
        });
    }
    @Override public void refuse(String principal, UUID conversation, UUID id, String reason) {
        transaction.executeWithoutResult(tx -> {
            if (jdbc.update("UPDATE eap.code_proposal SET status=?,reason=?,finished_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status=?",
                    CodeProposalStatus.REFUSED.wire(), reason, id, principal, conversation, CodeProposalStatus.PROPOSED.wire()) != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT, "CODE_APPLICATION_" + find(principal, conversation, id).map(Stored::status).orElse(CodeProposalStatus.UNKNOWN.wire()));
        });
    }

    record ReviewRow(SourceWriteReview.Item item, CodeChangeService.Proposal proposal,
                     SourceWriteReview.Resolution resolution) {}

    List<SourceWriteReview.Item> reviewItems(String principal, String workspace) {
        return jdbc.query("""
            SELECT id,status,reason,started_at FROM eap.code_proposal
            WHERE principal=? AND workspace=? AND status IN (?, ?, ?)
            ORDER BY (status <> ?) DESC, started_at DESC, id DESC LIMIT 20
            """, (rs, i) -> reviewItem(rs), principal, workspace, CodeProposalStatus.APPLYING.wire(),
                CodeProposalStatus.UNKNOWN.wire(), CodeProposalStatus.CLOSED_UNKNOWN.wire(),
                CodeProposalStatus.CLOSED_UNKNOWN.wire());
    }

    Optional<ReviewRow> reviewRow(String principal, String workspace, UUID id) {
        return jdbc.query("""
            SELECT id,status,reason,started_at,proposal,unknown_review FROM eap.code_proposal
            WHERE principal=? AND workspace=? AND id=?
            """, (rs, i) -> {
                String audit = rs.getString("unknown_review");
                return new ReviewRow(reviewItem(rs), JSON.readValue(rs.getString("proposal"), CodeChangeService.Proposal.class),
                        audit == null ? null : JSON.readValue(audit, SourceWriteReview.Resolution.class));
            }, principal, workspace, id).stream().findFirst();
    }

    <T> T reviewLocked(String workspace, Supplier<T> action) {
        return transaction.execute(tx -> {
            WorkspaceInterlock.lock(jdbc, workspace);
            return action.get();
        });
    }

    void closeUnknown(String principal, String workspace, UUID id, SourceWriteReview.Resolution resolution) {
        if (jdbc.update("""
            UPDATE eap.code_proposal SET status=?,unknown_review=?::jsonb
            WHERE id=? AND principal=? AND workspace=? AND status=?
            """, CodeProposalStatus.CLOSED_UNKNOWN.wire(), JSON.writeValueAsString(resolution), id, principal, workspace,
                CodeProposalStatus.UNKNOWN.wire()) != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.CODE_REVIEW_NOT_UNKNOWN.code());
    }

    private static SourceWriteReview.Item reviewItem(ResultSet rs) throws SQLException {
        var started = rs.getTimestamp("started_at");
        return new SourceWriteReview.Item(rs.getObject("id", UUID.class),
                CodeProposalStatus.fromWire(rs.getString("status")).wire(), rs.getString("reason"),
                started == null ? null : started.toInstant());
    }
}
