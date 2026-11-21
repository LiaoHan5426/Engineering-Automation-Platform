package com.lh.eap.ai.graph;

import com.lh.eap.ai.graph.ChatMessageNode.Role;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

/**
 * Append-only persistence for the chat message graph. This is the backend authority for sent
 * messages (CT-02). Nodes are never updated or deleted - editing/regenerating append new nodes,
 * and branch switching is a read-only path selection. The DB enforces immutability via trigger;
 * this store deliberately exposes no update/delete operation.
 *
 * <p>The principal is bound to the server constant and is never accepted from a request. The
 * schema prefix is injectable so persistence tests can run the same SQL in an isolated schema;
 * production always uses the default {@code eap}.
 */
@Repository
public class ChatMessageGraphStore implements ChatMessageGraph {
    /** Server-bound identity, matching chat_conversation_principal and other persistence stores. */
    public static final String PRINCIPAL = "local-operator";

    private final JdbcTemplate jdbc;
    private final JsonMapper json = JsonMapper.builder().build();
    private final String conversationTable;
    private final String messageTable;

    @org.springframework.beans.factory.annotation.Autowired
    public ChatMessageGraphStore(JdbcTemplate jdbc) {
        this(jdbc, "eap");
    }

    public ChatMessageGraphStore(JdbcTemplate jdbc, String schema) {
        this.jdbc = jdbc;
        if (schema == null || !schema.matches("[a-z][a-z0-9_]*"))
            throw new IllegalArgumentException("invalid schema: " + schema);
        this.conversationTable = schema + ".chat_conversation";
        this.messageTable = schema + ".chat_message";
    }

    @Override
    @Transactional
    public UUID createConversation(UUID conversationId, String workspacePath, String workspaceLabel,
            UUID connectionId, Long connectionRevision, String model, Instant now) {
        if (conversationId == null) conversationId = UUID.randomUUID();
        if (workspacePath == null || workspacePath.isBlank())
            throw new IllegalArgumentException("workspacePath is required");
        jdbc.update(
                "INSERT INTO " + conversationTable + """
                    (id, principal, workspace_path, workspace_label, connection_id,
                     connection_revision, model, created_at, touched_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """,
                conversationId, PRINCIPAL, workspacePath,
                workspaceLabel == null ? "" : workspaceLabel,
                connectionId, connectionRevision, model,
                Timestamp.from(now), Timestamp.from(now));
        return conversationId;
    }

    /** Append a new node. The caller assigns a fresh UUID and a sibling version via MessageGraph. */
    @Override
    @Transactional
    public void appendNode(ChatMessageNode node) {
        String snapshot = snapshotOf(node);
        jdbc.update(
                "INSERT INTO " + messageTable + """
                    (id, conversation_id, parent_id, role, version, snapshot, execution_id,
                     sequence, created_at)
                    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?, ?)
                    """,
                node.id(), node.conversationId(), node.parentId(), node.role().wire(), node.version(),
                snapshot, node.executionId(), node.sequence(), Timestamp.from(node.createdAt()));
        advanceTouched(node.conversationId(), node.createdAt());
    }

    private void advanceTouched(UUID conversationId, Instant at) {
        jdbc.update(
                "UPDATE " + conversationTable + " SET touched_at = GREATEST(touched_at, ?) WHERE id = ?",
                Timestamp.from(at), conversationId);
    }

    private String snapshotOf(ChatMessageNode node) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", node.id().toString());
        map.put("role", node.role().wire());
        map.put("text", node.text());
        if (node.thinking() != null) map.put("thinking", node.thinking());
        if (node.citations() != null) {
            try {
                map.put("citations", json.readValue(node.citations(), List.class));
            } catch (Exception e) {
                throw new IllegalArgumentException("citations must be a JSON array", e);
            }
        }
        return json.writeValueAsString(map);
    }

    public Optional<ChatMessageNode> findNode(UUID id) {
        return jdbc.query(
                "SELECT " + SELECT + " FROM " + messageTable + " WHERE id = ?",
                (rs, row) -> map(rs), id).stream().findFirst();
    }

    public List<ChatMessageNode> children(UUID conversationId, UUID parentId) {
        String sql = "SELECT " + SELECT + " FROM " + messageTable + " WHERE conversation_id = ? AND "
                + (parentId == null ? "parent_id IS NULL" : "parent_id = ?") + " ORDER BY version";
        return parentId == null
                ? jdbc.query(sql, (rs, row) -> map(rs), conversationId)
                : jdbc.query(sql, (rs, row) -> map(rs), conversationId, parentId);
    }

    @Override
    public List<ChatMessageNode> allInConversation(UUID conversationId) {
        return jdbc.query(
                "SELECT " + SELECT + " FROM " + messageTable + " WHERE conversation_id = ? ORDER BY sequence",
                (rs, row) -> map(rs), conversationId);
    }

    @Override
    public Optional<ChatMessageNode> lastNode(UUID conversationId) {
        return jdbc.query(
                "SELECT " + SELECT + " FROM " + messageTable
                        + " WHERE conversation_id = ? ORDER BY sequence DESC LIMIT 1",
                (rs, row) -> map(rs), conversationId).stream().findFirst();
    }

    @Override
    public long nextSequence(UUID conversationId) {
        Long value = jdbc.queryForObject(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM " + messageTable + " WHERE conversation_id = ?",
                Long.class, conversationId);
        return value == null ? 1L : value;
    }

    /**
     * Resolve the selected branch root-first. Loads the conversation's nodes and delegates to the
     * pure graph logic, so the same invariants (cycle/missing parent/cross-conversation) hold
     * whether the graph lives in memory or in the DB.
     */
    public List<ChatMessageNode> pathToRoot(UUID conversationId, UUID leafId) {
        List<ChatMessageNode> all = allInConversation(conversationId);
        Map<UUID, ChatMessageNode> byId = new HashMap<>();
        all.forEach(n -> byId.put(n.id(), n));
        Function<UUID, ChatMessageNode> lookup = byId::get;
        return MessageGraph.pathToRoot(leafId, conversationId, lookup);
    }

    public long countInConversation(UUID conversationId) {
        Long value = jdbc.queryForObject(
                "SELECT count(*) FROM " + messageTable + " WHERE conversation_id = ?",
                Long.class, conversationId);
        return value == null ? 0L : value;
    }

    private static final String SELECT = """
            id, conversation_id, parent_id, role, version, snapshot, execution_id, sequence, created_at
            """;

    private ChatMessageNode map(java.sql.ResultSet rs) throws java.sql.SQLException {
        tools.jackson.databind.JsonNode snapshot = json.readTree(rs.getString("snapshot"));
        tools.jackson.databind.JsonNode textNode = snapshot.get("text");
        String text = textNode == null || textNode.isNull() ? null : textNode.asText();
        String thinking = snapshot.has("thinking") && !snapshot.get("thinking").isNull()
                ? snapshot.get("thinking").asText() : null;
        String citations = snapshot.has("citations") && !snapshot.get("citations").isNull()
                ? snapshot.get("citations").toString() : null;
        String exec = rs.getString("execution_id");
        return new ChatMessageNode(
                (UUID) rs.getObject("id"),
                (UUID) rs.getObject("conversation_id"),
                (UUID) rs.getObject("parent_id"),
                Role.fromWire(rs.getString("role")),
                rs.getInt("version"),
                text, thinking, citations,
                exec == null ? null : UUID.fromString(exec),
                rs.getLong("sequence"),
                rs.getTimestamp("created_at").toInstant());
    }
}
