package com.lh.eap.ai;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;

/** Full-host callers use the real durable graph authority, never a mock or linear memory fallback. */
final class ChatApplicationTestSupport {
    private static final JsonMapper JSON = JsonMapper.builder().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build();
    private ChatApplicationTestSupport() {}

    static AiChatApplication graph(AiChatApplication application) {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:caller_" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        var jdbc = new JdbcTemplate(ds);
        jdbc.execute("CREATE SCHEMA eap");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V3__chat_message_graph.sql")).execute(ds);
        ReflectionTestUtils.setField(application, "graphs", new ChatGraphStore(jdbc, new DataSourceTransactionManager(ds)));
        return application;
    }

    static void rememberConversation(AiChatApplication application, UUID conversation) {
        var store = (ChatGraphStore) ReflectionTestUtils.getField(application, "graphs");
        var owner = (ChatGraphStore.Owner) ReflectionTestUtils.invokeMethod(application, "graphOwner", conversation);
        store.open(owner);
    }

    /** Seed an already completed durable turn without invoking a provider. */
    static void seed(AiChatApplication application, UUID conversation, String user, String assistant) {
        var store = (ChatGraphStore) ReflectionTestUtils.getField(application, "graphs");
        var owner = (ChatGraphStore.Owner) ReflectionTestUtils.invokeMethod(application, "graphOwner", conversation);
        var graph = store.read(owner);
        UUID parent = null;
        for (var node : graph.nodes()) if (node.role().equals("assistant")) parent = node.id();
        var operation = UUID.randomUUID();
        var reservation = store.reserve(owner, operation, operation.toString(), graph.revision(), "send", parent, null, user, false);
        store.finish(owner, reservation, new com.lh.eap.ai.dto.AiMessageResponse(reservation.operation().executionId(), assistant, "",
                "SUCCEEDED", "", "", java.util.List.of(), "", java.util.List.of()));
    }

    /** Each intentional send is a new operation on the current durable path. Explicit protocol tests bypass this helper. */
    static String request(AiChatApplication application, UUID conversation, String json) {
        if (json == null) return null;
        final Map<String, Object> body;
        try {
            Map<?, ?> parsed = JSON.readValue(json, Map.class);
            body = new LinkedHashMap<>();
            for (var entry : parsed.entrySet()) body.put(String.valueOf(entry.getKey()), entry.getValue());
        } catch (RuntimeException malformed) { return json; }
        body.putIfAbsent("operationId", UUID.randomUUID().toString());
        body.putIfAbsent("kind", "send");
        long revision = 0;
        UUID parent = null;
        try {
            var graph = application.graph(conversation);
            revision = graph.revision();
            for (var node : graph.nodes()) if (node.role().equals("assistant")) parent = node.id();
        } catch (org.springframework.web.server.ResponseStatusException unknown) {
            if (unknown.getStatusCode().value() != 404) throw unknown;
        }
        body.putIfAbsent("expectedRevision", revision);
        if (!body.containsKey("parentMessageId")) body.put("parentMessageId", parent);
        return JSON.writeValueAsString(body);
    }
}
