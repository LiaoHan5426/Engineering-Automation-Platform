package com.lh.eap.ai.execution;

import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.ai.dto.ChatExecutionSnapshot;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * JDBC adapter for the durable chat execution log (CT-01). Events are append-only; the head is
 * advanced only toward a terminal state. The schema prefix is injectable so persistence tests can
 * run the same SQL in an isolated schema; production always uses {@code eap}.
 *
 * <p>Read-side contract: an execution whose head is not complete is replayed with status
 * UNKNOWN and {@code complete=false}. This is deliberate — a process restart cannot resume an
 * in-process model call, so an interrupted turn must never look resumable or terminal.
 */
@Repository
public class JdbcChatExecutionStore implements ChatExecutionStore {
    private final JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    private final String executionTable;
    private final String eventTable;

    @org.springframework.beans.factory.annotation.Autowired
    public JdbcChatExecutionStore(JdbcTemplate jdbc) {
        this(jdbc, "eap");
    }

    public JdbcChatExecutionStore(JdbcTemplate jdbc, String schema) {
        this.jdbc = jdbc;
        if (schema == null || !schema.matches("[a-z][a-z0-9_]*"))
            throw new IllegalArgumentException("invalid schema: " + schema);
        this.executionTable = schema + ".chat_execution";
        this.eventTable = schema + ".chat_execution_event";
    }

    @Override
    public void open(UUID executionId, UUID conversationId, String initialStatus, Instant now) {
        jdbc.update(
                "INSERT INTO " + executionTable + """
                    (id, conversation_id, status, complete, opened_at, closed_at)
                    VALUES (?, ?, ?, false, ?, NULL)
                    ON CONFLICT (id) DO NOTHING
                    """,
                executionId, conversationId, initialStatus, Timestamp.from(now));
    }

    @Override
    public void appendEvent(ChatExecutionEvent event) {
        String payloadJson;
        try {
            payloadJson = event.payload() == null ? null : json.writeValueAsString(event.payload());
        } catch (Exception e) {
            throw new IllegalArgumentException("execution event payload is not JSON-serializable", e);
        }
        jdbc.update(
                "INSERT INTO " + eventTable + """
                    (execution_id, sequence, event_id, type, text, code, status, payload, occurred_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?)
                    """,
                event.executionId(), event.sequence(), event.eventId(), event.type(),
                nullToEmpty(event.text()), nullToEmpty(event.code()), nullToEmpty(event.status()),
                payloadJson, Timestamp.from(event.occurredAt() == null ? Instant.now() : event.occurredAt()));
    }

    @Override
    public void finish(UUID executionId, String status, boolean complete, Instant now) {
        if (!complete) {
            // A non-terminal update only advances status (e.g. RUNNING -> CANCELLING).
            jdbc.update(
                    "UPDATE " + executionTable + " SET status = ? WHERE id = ? AND complete = false",
                    status, executionId);
            return;
        }
        jdbc.update(
                "UPDATE " + executionTable + " SET status = ?, complete = true, closed_at = ? "
                        + "WHERE id = ? AND complete = false",
                status, Timestamp.from(now), executionId);
    }

    @Override
    public Optional<ChatExecutionSnapshot> read(UUID conversationId, UUID executionId, long afterSequence) {
        if (afterSequence < 0) return Optional.empty();
        Head head = jdbc.query(
                "SELECT status, complete FROM " + executionTable + " WHERE id = ? AND conversation_id = ?",
                (rs, row) -> new Head(rs.getString("status"), rs.getBoolean("complete")),
                executionId, conversationId).stream().findFirst().orElse(null);
        if (head == null) return Optional.empty();

        List<ChatExecutionEvent> events = jdbc.query(
                "SELECT " + EVENT_SELECT + " FROM " + eventTable
                        + " WHERE execution_id = ? AND sequence > ? ORDER BY sequence",
                (rs, row) -> mapEvent(rs, conversationId), executionId, afterSequence);
        Long latest = jdbc.queryForObject(
                "SELECT COALESCE(MAX(sequence), 0) FROM " + eventTable + " WHERE execution_id = ?",
                Long.class, executionId);
        long latestSequence = latest == null ? 0L : latest;

        boolean complete = head.complete();
        String status = complete ? head.status() : "UNKNOWN";
        return Optional.of(new ChatExecutionSnapshot(executionId, conversationId, latestSequence, complete, status, events));
    }

    private static final String EVENT_SELECT = """
            execution_id, sequence, event_id, type, text, code, status, payload, occurred_at
            """;

    private ChatExecutionEvent mapEvent(ResultSet rs, UUID conversationId) throws SQLException {
        String payload = rs.getString("payload");
        Object decoded = payload == null ? null : json.readTree(payload);
        return new ChatExecutionEvent(
                (UUID) rs.getObject("event_id"),
                rs.getLong("sequence"),
                (UUID) rs.getObject("execution_id"),
                conversationId,
                null,
                rs.getString("type"),
                ChatExecutionEvent.PROTOCOL_VERSION,
                rs.getTimestamp("occurred_at").toInstant(),
                rs.getString("text"),
                rs.getString("code"),
                rs.getString("status"),
                decoded);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    private record Head(String status, boolean complete) {}
}
