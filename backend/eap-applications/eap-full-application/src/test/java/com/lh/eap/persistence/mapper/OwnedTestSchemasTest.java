package com.lh.eap.persistence.mapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.sql.Connection;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;

class OwnedTestSchemasTest {
    @Test void cleansRegisteredSchemaEvenWhenSetupFails() throws Exception {
        var source = mock(DataSource.class);
        var connection = mock(Connection.class);
        var statement = mock(Statement.class);
        when(source.getConnection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);
        var schemas = new OwnedTestSchemas();
        String schema = "eap_unknown_qa_365fc243a4ae41deb73f0c60a8f35020";
        schemas.register(source, schema);
        schemas.afterEach(null);
        verify(statement).execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        verify(statement).setQueryTimeout(10);
        verify(connection).close();
        schemas.afterEach(null);
        verify(source, times(1)).getConnection();
    }

    @Test void rejectsApplicationSchemasAndSqlInjection() {
        var schemas = new OwnedTestSchemas();
        var source = mock(DataSource.class);
        for (String name : new String[] {"eap", "public", "eap_unknown_qa_abc", "eap_unknown_qa_" + "a".repeat(32) + ";"}) {
            assertThrows(IllegalArgumentException.class, () -> schemas.register(source, name));
        }
        verifyNoInteractions(source);
    }

    @Test void attemptsRemainingCleanupAndReportsFailures() throws Exception {
        var source = mock(DataSource.class);
        var connection = mock(Connection.class);
        var statement = mock(Statement.class);
        when(source.getConnection()).thenThrow(new java.sql.SQLException("unavailable")).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);
        var schemas = new OwnedTestSchemas();
        schemas.register(source, "eap_unknown_qa_" + "a".repeat(32));
        schemas.register(source, "eap_unknown_qa_" + "b".repeat(32));
        var failure = assertThrows(Exception.class, () -> schemas.afterEach(null));
        assertEquals(1, failure.getSuppressed().length);
        verify(statement).execute("DROP SCHEMA IF EXISTS eap_unknown_qa_" + "b".repeat(32) + " CASCADE");
    }
}
