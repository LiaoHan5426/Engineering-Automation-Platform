package com.lh.eap.persistence.mapper;

import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.extension.AfterEachCallback;
import org.junit.jupiter.api.extension.ExtensionContext;

/** Registers ownership before setup so failed migrations and assertions also release schemas. */
final class OwnedTestSchemas implements AfterEachCallback {
    private record Owned(DataSource source, String schema) {}
    private final List<Owned> owned = new ArrayList<>();

    void register(DataSource source, String schema) {
        if (schema == null || !schema.matches("eap_unknown_qa_[a-f0-9]{32}")) {
            throw new IllegalArgumentException("Not an owned test schema: " + schema);
        }
        owned.add(new Owned(source, schema));
    }

    @Override
    public void afterEach(ExtensionContext context) throws Exception {
        var failure = new Exception("Failed to clean owned test schemas");
        var pending = List.copyOf(owned);
        owned.clear();
        for (var item : pending) {
            try (var connection = item.source().getConnection(); var statement = connection.createStatement()) {
                statement.setQueryTimeout(10);
                statement.execute("SET lock_timeout = '5s'");
                statement.execute("DROP SCHEMA IF EXISTS " + item.schema() + " CASCADE");
            } catch (Exception error) {
                failure.addSuppressed(new Exception("Cleanup failed for " + item.schema(), error));
            }
        }
        if (failure.getSuppressed().length > 0) throw failure;
    }
}
