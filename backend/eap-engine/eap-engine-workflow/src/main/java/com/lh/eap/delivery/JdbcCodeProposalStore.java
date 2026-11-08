package com.lh.eap.delivery;
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
    private final com.lh.eap.application.service.BoardCodeTaskBinding tasks;
    public JdbcCodeProposalStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this(jdbc, manager, new JdbcCodeGenerationStore(jdbc, manager),
                new com.lh.eap.application.service.BoardCodeTaskBinding(new com.lh.eap.application.service.BoardTaskService(jdbc),
                        new com.lh.eap.persistence.mapper.JdbcPrototypeVersionStore(jdbc)));
    }
    @org.springframework.beans.factory.annotation.Autowired
    public JdbcCodeProposalStore(JdbcTemplate jdbc, PlatformTransactionManager manager, CodeGenerationStore generations,
                                 com.lh.eap.application.service.BoardCodeTaskBinding tasks) {
        this.jdbc = jdbc;
        this.generations = generations; this.tasks = tasks;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        transaction.setTimeout(10);
        nonTransactional = new TransactionTemplate(manager);
        nonTransactional.setPropagationBehavior(TransactionDefinition.PROPAGATION_NOT_SUPPORTED);
    }
    @Override public <T> T withoutTransaction(java.util.function.Supplier<T> action) {
        return nonTransactional.execute(tx -> action.get());
    }
    @Override public void save(String principal, CodeChangeService.Proposal proposal) {
        transaction.executeWithoutResult(tx -> {
            if (proposal.generation() == null || proposal.files().size() != 1) throw new IllegalArgumentException("generation required");
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
            if (!row.status().equals("PROPOSED")) return false;
            // Derive the lock from immutable source evidence, not a caller/summary-selected task.
            var generation = generations.find(row.proposal().generation().id()).orElseThrow();
            var binding = generation.taskSnapshot();
            if (binding != null) tasks.lock(binding.binding());
            var workspace = row.proposal().workspace();
            com.lh.eap.application.service.WorkspaceInterlock.lock(jdbc, workspace);
            row = find(principal, conversation, id).orElseThrow();
            if (!row.status().equals("PROPOSED")) return false;
            if (binding != null) tasks.validateLocked(binding);
            if (com.lh.eap.application.service.WorkspaceInterlock.codeActive(jdbc, workspace)
                    || com.lh.eap.application.service.WorkspaceInterlock.boardActive(jdbc, workspace))
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "CODE_WORKSPACE_BUSY");
            return jdbc.update("UPDATE eap.code_proposal SET status='APPLYING',started_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status='PROPOSED'",
                    id, principal, conversation) == 1;
        }));
    }
    @Override public void recoverInterrupted(String workspace) {
        transaction.executeWithoutResult(tx -> {
            com.lh.eap.application.service.WorkspaceInterlock.lock(jdbc, workspace);
            jdbc.update("UPDATE eap.code_proposal SET status='UNKNOWN',reason='CODE_APPLICATION_INTERRUPTED' WHERE lower(workspace)=lower(?) AND status='APPLYING'", workspace);
        });
    }
    @Override public void finish(String principal, UUID conversation, UUID id, String status, CodeChangeService.Applied result, String reason) {
        if (!Set.of("APPLIED", "FAILED", "UNKNOWN").contains(status)) throw new IllegalArgumentException("invalid result status");
        transaction.executeWithoutResult(tx -> {
            if (jdbc.update("UPDATE eap.code_proposal SET status=?,result=?::jsonb,reason=?,finished_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status='APPLYING'",
                    status, result == null ? null : JSON.writeValueAsString(result), reason, id, principal, conversation) != 1)
                throw new IllegalStateException("proposal claim lost");
        });
    }
    @Override public void refuse(String principal, UUID conversation, UUID id, String reason) {
        transaction.executeWithoutResult(tx -> {
            if (jdbc.update("UPDATE eap.code_proposal SET status='REFUSED',reason=?,finished_at=now() WHERE id=? AND principal=? AND conversation_id=? AND status='PROPOSED'",
                    reason, id, principal, conversation) != 1)
                throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT, "CODE_APPLICATION_" + find(principal, conversation, id).map(Stored::status).orElse("UNKNOWN"));
        });
    }
}
