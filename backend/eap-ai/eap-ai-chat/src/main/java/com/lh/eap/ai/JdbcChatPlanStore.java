package com.lh.eap.ai;
import com.lh.eap.ai.dto.ChatPlanSnapshot;
import java.util.*;
import java.util.function.UnaryOperator;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
/** Execution row locks serialize lifecycle, CAS and idempotency in one database transaction. */
public class JdbcChatPlanStore implements ChatPlanStore {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    public JdbcChatPlanStore(JdbcTemplate jdbc, PlatformTransactionManager transactions) {
        this.jdbc = jdbc; this.tx = new TransactionTemplate(transactions);
        this.tx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.tx.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.tx.setTimeout(10);
    }
    public void open(Owner o) {
        jdbc.update("INSERT INTO eap.chat_plan_execution(execution_id,conversation_id,principal,workspace) VALUES (?,?,?,?)",
                o.executionId(), o.conversationId(), o.principal(), o.workspace());
    }
    private record Row(boolean writable, String snapshot) {}
    private Row row(Owner o, boolean lock) {
        var rows = jdbc.query("SELECT writable,snapshot FROM eap.chat_plan_execution WHERE execution_id=? AND conversation_id=? AND principal=? AND workspace=?" + (lock ? " FOR UPDATE" : ""),
                (rs,n) -> new Row(rs.getBoolean(1), rs.getString(2)), o.executionId(),o.conversationId(),o.principal(),o.workspace());
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_EXECUTION");
        return rows.getFirst();
    }
    public void close(Owner o) {
        jdbc.update("UPDATE eap.chat_plan_execution SET writable=false WHERE execution_id=? AND conversation_id=? AND principal=? AND workspace=?",
                o.executionId(),o.conversationId(),o.principal(),o.workspace());
    }
    private ChatPlanSnapshot decode(String value) { return value == null ? null : JSON.readValue(value, ChatPlanSnapshot.class); }
    public ChatPlanSnapshot read(Owner o) { return decode(row(o,false).snapshot()); }
    public ChatPlanSnapshot update(Owner o, UUID operationId, String command, long expectedRevision, UnaryOperator<ChatPlanSnapshot> replacement) {
        return tx.execute(transaction -> {
            var row = row(o,true);
            if (!row.writable()) throw ChatPlanService.closed();
            var operations = jdbc.query("SELECT command,result FROM eap.chat_plan_operation WHERE execution_id=? AND operation_id=?",
                    (rs,n) -> new String[]{rs.getString(1),rs.getString(2)},o.executionId(),operationId);
            if (!operations.isEmpty()) {
                if (!operations.getFirst()[0].equals(command)) throw new ResponseStatusException(HttpStatus.CONFLICT,ChatPlanErrors.CHAT_PLAN_OPERATION_CONFLICT.code());
                return decode(operations.getFirst()[1]);
            }
            var previous = decode(row.snapshot());
            if ((previous == null ? 0 : previous.revision()) != expectedRevision)
                throw new ResponseStatusException(HttpStatus.CONFLICT,ChatPlanErrors.CHAT_PLAN_REVISION_CONFLICT.code());
            var next = replacement.apply(previous);
            String result = JSON.writeValueAsString(next);
            jdbc.update("UPDATE eap.chat_plan_execution SET snapshot=? WHERE execution_id=?",result,o.executionId());
            jdbc.update("INSERT INTO eap.chat_plan_operation(execution_id,operation_id,command,result) VALUES (?,?,?,?)",o.executionId(),operationId,command,result);
            return next;
        });
    }
}
