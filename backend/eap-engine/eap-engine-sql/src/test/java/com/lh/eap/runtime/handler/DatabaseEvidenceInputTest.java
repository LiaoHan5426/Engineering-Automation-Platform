package com.lh.eap.runtime.handler;

import com.lh.eap.core.DatabaseGrantQuery;
import com.lh.eap.domain.model.*;
import com.lh.eap.rules.SqlFactVocabulary;
import com.lh.eap.sql.DatabaseEvidenceInput;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DatabaseEvidenceInputTest {
    record Evidence(UUID databaseId, Map<String, Object> explainPlan) implements DatabaseEvidenceInput {}

    @Test void missingOrWrongDomainInputProducesNoDatabaseReads() {
        var jdbc = mock(JdbcTemplate.class);
        var grants = mock(DatabaseGrantQuery.class);
        var handler = new DatabaseMetadataHandler(jdbc, grants);
        record OtherInput(UUID databaseId) implements CapabilityRequest {}
        for (var request : Arrays.asList(null, new OtherInput(UUID.randomUUID()))) {
            var context = context("database.schema.read", request, "");
            var result = handler.handle(context);
            assertFalse(result.success());
            assertTrue(result.incomplete());
            assertTrue(context.facts().containsValue(CapabilityContext.NOT_PRODUCED));
        }
        verifyNoInteractions(jdbc, grants);
    }

    @Test void typedProfileReferenceStillRequiresTheExpertsDatabaseGrant() {
        var jdbc = mock(JdbcTemplate.class);
        var grants = mock(DatabaseGrantQuery.class);
        var id = UUID.randomUUID();
        var handler = new DatabaseMetadataHandler(jdbc, grants);
        var request = new Evidence(id, null);
        var denied = handler.handle(context("database.schema.read", request, ""));
        assertFalse(denied.success());
        verify(grants).databaseGranted("expert", id);
        verifyNoInteractions(jdbc);
        when(grants.databaseGranted("expert", id)).thenReturn(true);
        when(jdbc.queryForList(anyString(), eq(id))).thenReturn(List.of(Map.of("metadata", "{\"tables\":[]}")));
        handler.handle(context("database.schema.read", request, ""));
        verify(jdbc).queryForList("SELECT metadata::text AS metadata FROM eap.database_profile WHERE id=?", id);
    }

    @Test void suppliedPlanWorksWithoutProductRequestAndMissingInputStaysIncomplete() {
        var handler = new DatabaseExplainHandler();
        var supplied = context("database.explain", new Evidence(null, Map.of("Node Type", "Seq Scan")), "");
        assertTrue(handler.handle(supplied).success());
        assertEquals(true, supplied.facts().get("plan.loaded"));
        assertEquals(true, supplied.facts().get("plan.seqScan"));
        var missing = context("database.explain", null, "");
        assertTrue(handler.handle(missing).incomplete());
        assertEquals(false, missing.facts().get("plan.loaded"));
        var malformed = context("database.explain", new Evidence(null, Map.of("other", "value")), "");
        assertFalse(handler.handle(malformed).success());
        assertEquals(false, malformed.facts().get("plan.loaded"));
    }

    @Test void sqlParserUsesPreparedDomainTextWithoutAProductRequest() {
        var context = context("sql.parse", null, "select id from orders");
        assertTrue(new SqlParseHandler().handle(context).success());
        assertEquals("valid", context.analysis().get("parseStatus"));
        assertEquals(List.of("orders"), context.analysis().get("tables"));
    }

    private static CapabilityContext context(String capability, CapabilityRequest request, String input) {
        return new CapabilityContext(new ExpertManifest.Step("node", "Node", capability, true), request,
                input, "question", "expert", UUID.randomUUID(), List.of(), new HashMap<>(), new HashMap<>(),
                new ArrayList<>(), new ArrayList<>(), List.of(), null, SqlFactVocabulary.FACTS_BY_KEY.keySet());
    }
}
