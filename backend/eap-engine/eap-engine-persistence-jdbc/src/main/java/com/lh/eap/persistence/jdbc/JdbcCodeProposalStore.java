package com.lh.eap.persistence.jdbc;

import com.lh.eap.core.CodeEvidenceStore;
import com.lh.eap.core.CodeGenerationEvidenceStore;
import com.lh.eap.core.CodeProposalEvidenceStore;
import com.lh.eap.core.CodeTaskBinding;
import com.lh.eap.core.WorkspaceLockStore;
import com.lh.eap.domain.model.CodeProposalStatus;
import com.lh.eap.error.CodeErrors;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Durable proposal SQL. Board rules, filesystem evidence and business decisions stay outside. */
@Repository
public class JdbcCodeProposalStore implements CodeProposalEvidenceStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final WorkspaceLockStore locks;
    private final CodeGenerationEvidenceStore generations;
    private final TransactionTemplate transaction;
    private final TransactionTemplate claimTransaction;
    private final TransactionTemplate nonTransactional;

    public JdbcCodeProposalStore(JdbcTemplate jdbc, PlatformTransactionManager manager, WorkspaceLockStore locks,
                                 CodeGenerationEvidenceStore generations) {
        this.jdbc = jdbc;
        this.locks = locks;
        this.generations = generations;
        claimTransaction = template(manager, TransactionDefinition.PROPAGATION_REQUIRES_NEW,
                TransactionDefinition.ISOLATION_READ_COMMITTED, 90);
        transaction = template(manager, TransactionDefinition.PROPAGATION_REQUIRES_NEW,
                TransactionDefinition.ISOLATION_READ_COMMITTED, 10);
        nonTransactional = template(manager, TransactionDefinition.PROPAGATION_NOT_SUPPORTED,
                TransactionDefinition.ISOLATION_DEFAULT, TransactionDefinition.TIMEOUT_DEFAULT);
    }

    private static TransactionTemplate template(PlatformTransactionManager manager, int propagation, int isolation, int timeout) {
        var result = new TransactionTemplate(manager);
        result.setPropagationBehavior(propagation);
        result.setIsolationLevel(isolation);
        result.setTimeout(timeout);
        return result;
    }

    private void lockWorkspace(String workspace) {
        if (!TransactionSynchronizationManager.isActualTransactionActive())
            throw new IllegalStateException("Workspace reservation requires a transaction");
        locks.lock(workspace);
    }

    private void requireWorkspaceIdle(String workspace) {
        if (locks.codeActive(workspace) || locks.boardActive(workspace))
            throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.CODE_WORKSPACE_BUSY.code());
    }

    @Override
    public void saveProposal(String principal, CodeEvidenceStore.Proposal proposal) {
        transaction.executeWithoutResult(tx -> {
            if (proposal.generation() == null) throw new IllegalArgumentException("generation required");
            var snapshot = generations.find(proposal.generation().id()).orElseThrow();
            if (!JdbcCodeGenerationStore.reference(snapshot).equals(proposal.generation())
                    || proposal.files().size() != snapshot.sources().size())
                throw new IllegalArgumentException("generation scope mismatch");
            for (int i = 0; i < snapshot.sources().size(); i++) {
                var source = snapshot.sources().get(i);
                var change = proposal.files().get(i);
                if (!source.path().equals(change.path()) || !source.baseHash().equals(change.baseHash())
                        || !Objects.equals(source.content(), change.before()))
                    throw new IllegalArgumentException("generation scope mismatch");
            }
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

    @Override
    public Optional<CodeEvidenceStore.Stored> findProposal(String principal, UUID conversation, UUID id) {
        return jdbc.query("SELECT * FROM eap.code_proposal WHERE id=? AND principal=? AND conversation_id=?", (rs, row) ->
                new CodeEvidenceStore.Stored(rs.getString("principal"), JSON.readValue(rs.getString("proposal"), CodeEvidenceStore.Proposal.class),
                        rs.getString("status"), rs.getString("result") == null ? null : JSON.readValue(rs.getString("result"), CodeEvidenceStore.Applied.class),
                        rs.getString("reason"), rs.getTimestamp("started_at") == null ? null : rs.getTimestamp("started_at").toInstant(),
                        rs.getTimestamp("finished_at") == null ? null : rs.getTimestamp("finished_at").toInstant()), id, principal, conversation)
                .stream().findFirst();
    }

    @Override
    public boolean claim(String principal, UUID conversation, UUID id, CodeTaskBinding binding, Supplier<String> baseline) {
        return Boolean.TRUE.equals(claimTransaction.execute(tx -> {
            var row = findProposal(principal, conversation, id).orElseThrow();
            if (!row.status().equals(CodeProposalStatus.PROPOSED.wire())) return false;
            // Derive the lock from immutable source evidence, not a caller/summary-selected task.
            var generation = generations.find(row.proposal().generation().id()).orElseThrow();
            var taskSnapshot = generation.taskSnapshot();
            if (taskSnapshot != null) binding.lock(taskSnapshot.binding());
            var workspace = row.proposal().workspace();
            lockWorkspace(workspace);
            row = findProposal(principal, conversation, id).orElseThrow();
            if (!row.status().equals(CodeProposalStatus.PROPOSED.wire())) return false;
            if (taskSnapshot != null) binding.validateLocked(taskSnapshot);
            requireWorkspaceIdle(workspace);
            var json = baseline.get();
            return jdbc.update("UPDATE eap.code_proposal SET application_baseline=?::jsonb,status=?,started_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status=?",
                    json, CodeProposalStatus.APPLYING.wire(), id, principal, conversation, CodeProposalStatus.PROPOSED.wire()) == 1;
        }));
    }

    @Override
    public void recoverInterrupted(String workspace) {
        transaction.executeWithoutResult(tx -> {
            lockWorkspace(workspace);
            jdbc.update("UPDATE eap.code_proposal SET status=?,reason=? WHERE lower(workspace)=lower(?) AND status=?",
                    CodeProposalStatus.UNKNOWN.wire(), CodeErrors.CODE_APPLICATION_INTERRUPTED.code(), workspace,
                    CodeProposalStatus.APPLYING.wire());
        });
    }

    @Override
    public void finish(String principal, UUID conversation, UUID id, String status,
                       CodeEvidenceStore.Applied result, String reason) {
        if (!Set.of(CodeProposalStatus.APPLIED.wire(), CodeProposalStatus.FAILED.wire(), CodeProposalStatus.UNKNOWN.wire()).contains(status))
            throw new IllegalArgumentException("invalid result status");
        transaction.executeWithoutResult(tx -> {
            if (jdbc.update("UPDATE eap.code_proposal SET status=?,result=?::jsonb,reason=?,finished_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status=?",
                    status, result == null ? null : JSON.writeValueAsString(result), reason, id, principal, conversation,
                    CodeProposalStatus.APPLYING.wire()) != 1)
                throw new IllegalStateException("proposal claim lost");
        });
    }

    @Override
    public void refuse(String principal, UUID conversation, UUID id, String reason) {
        transaction.executeWithoutResult(tx -> {
            if (jdbc.update("UPDATE eap.code_proposal SET status=?,reason=?,finished_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status=?",
                    CodeProposalStatus.REFUSED.wire(), reason, id, principal, conversation, CodeProposalStatus.PROPOSED.wire()) != 1)
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "CODE_APPLICATION_" + findProposal(principal, conversation, id).map(CodeEvidenceStore.Stored::status).orElse(CodeProposalStatus.UNKNOWN.wire()));
        });
    }

    @Override
    public <T> T withoutTransaction(Supplier<T> action) {
        return nonTransactional.execute(tx -> action.get());
    }

    @Override
    public List<CodeEvidenceStore.ReviewItem> reviewItems(String principal, String workspace) {
        return jdbc.query("""
            SELECT id,status,reason,started_at FROM eap.code_proposal
            WHERE principal=? AND workspace=? AND status IN (?, ?, ?)
            ORDER BY (status <> ?) DESC, started_at DESC, id DESC LIMIT 20
            """, (rs, i) -> reviewItem(rs), principal, workspace, CodeProposalStatus.APPLYING.wire(),
                CodeProposalStatus.UNKNOWN.wire(), CodeProposalStatus.CLOSED_UNKNOWN.wire(),
                CodeProposalStatus.CLOSED_UNKNOWN.wire());
    }

    @Override
    public Optional<CodeEvidenceStore.ReviewRow> reviewRow(String principal, String workspace, UUID id) {
        return jdbc.query("""
            SELECT id,status,reason,started_at,proposal,unknown_review FROM eap.code_proposal
            WHERE principal=? AND workspace=? AND id=?
            """, (rs, i) -> {
                String audit = rs.getString("unknown_review");
                return new CodeEvidenceStore.ReviewRow(reviewItem(rs), JSON.readValue(rs.getString("proposal"), CodeEvidenceStore.Proposal.class),
                        audit == null ? null : JSON.readValue(audit, CodeEvidenceStore.Resolution.class));
            }, principal, workspace, id).stream().findFirst();
    }

    private static CodeEvidenceStore.ReviewItem reviewItem(java.sql.ResultSet rs) throws java.sql.SQLException {
        var started = rs.getTimestamp("started_at");
        return new CodeEvidenceStore.ReviewItem(rs.getObject("id", UUID.class),
                CodeProposalStatus.fromWire(rs.getString("status")).wire(), rs.getString("reason"),
                started == null ? null : started.toInstant());
    }

    @Override
    public <T> T reviewLocked(String workspace, Supplier<T> action) {
        return transaction.execute(tx -> {
            lockWorkspace(workspace);
            return action.get();
        });
    }

    @Override
    public void closeUnknown(String principal, String workspace, UUID id, CodeEvidenceStore.Resolution resolution) {
        if (jdbc.update("""
            UPDATE eap.code_proposal SET status=?,unknown_review=?::jsonb
            WHERE id=? AND principal=? AND workspace=? AND status=?
            """, CodeProposalStatus.CLOSED_UNKNOWN.wire(), JSON.writeValueAsString(resolution), id, principal, workspace,
                CodeProposalStatus.UNKNOWN.wire()) != 1)
            throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.CODE_REVIEW_NOT_UNKNOWN.code());
    }
}
