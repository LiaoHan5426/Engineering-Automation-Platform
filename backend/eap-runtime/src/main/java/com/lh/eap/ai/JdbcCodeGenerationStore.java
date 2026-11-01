package com.lh.eap.ai;

import java.sql.Timestamp;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Insert-only production adapter. Commit completes before a model can observe source context. */
@Repository
public class JdbcCodeGenerationStore implements CodeGenerationStore {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;
    public JdbcCodeGenerationStore(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        transaction = new TransactionTemplate(manager);
        transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transaction.setTimeout(10);
    }
    @Override public void save(Snapshot snapshot) {
        transaction.executeWithoutResult(status -> jdbc.update("""
                INSERT INTO eap.code_generation
                (id, principal, conversation_id, workspace, target_path, base_hash, source_content,
                 prototype_version_id, prototype_content_hash, captured_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, snapshot.id(), snapshot.principal(), snapshot.conversationId(), snapshot.workspace(),
                snapshot.targetPath(), snapshot.baseHash(), snapshot.source(), snapshot.prototypeVersionId(),
                snapshot.prototypeContentHash(), Timestamp.from(snapshot.capturedAt())));
    }
    @Override public Optional<Snapshot> find(UUID id) {
        return jdbc.query("SELECT * FROM eap.code_generation WHERE id=?", (rs, row) -> new Snapshot(
                rs.getObject("id", UUID.class), rs.getString("principal"), rs.getObject("conversation_id", UUID.class),
                rs.getString("workspace"), rs.getString("target_path"), rs.getString("base_hash"), rs.getString("source_content"),
                rs.getString("prototype_version_id"), rs.getString("prototype_content_hash"), rs.getTimestamp("captured_at").toInstant()), id)
                .stream().findFirst();
    }
}
