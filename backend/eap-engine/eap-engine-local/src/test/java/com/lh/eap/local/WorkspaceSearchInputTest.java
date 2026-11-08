package com.lh.eap.local;

import com.lh.eap.domain.model.CapabilityContext;
import com.lh.eap.domain.model.CapabilityRequest;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class WorkspaceSearchInputTest {
    @Test void localInputNeedsNoSqlWorkflowOrSpringContracts() {
        for (String type : List.of("com.lh.eap.sql.DatabaseEvidenceInput",
                "com.lh.eap.application.service.ExpertExecutionService", "org.springframework.context.ApplicationContext")) {
            assertThrows(ClassNotFoundException.class, () -> Class.forName(type));
        }
        WorkspaceSearchInput request = () -> "build failure";
        var context = context(request);
        assertSame(request, context.requestAs(WorkspaceSearchInput.class).orElseThrow());
        assertEquals("build failure", context.requestAs(WorkspaceSearchInput.class).orElseThrow().pattern());
        assertEquals("domain text", context.input());
    }

    @Test void nullOrUnrelatedInputCannotImpersonateTheSearchContract() {
        record OtherInput(String pattern) implements CapabilityRequest {}
        assertTrue(context(null).requestAs(WorkspaceSearchInput.class).isEmpty());
        assertTrue(context(new OtherInput("same field name")).requestAs(WorkspaceSearchInput.class).isEmpty());
    }

    private static CapabilityContext context(CapabilityRequest request) {
        return new CapabilityContext(null, request, "domain text", "question", "expert", UUID.randomUUID(),
                List.of(), new HashMap<>(), new HashMap<>(), new ArrayList<>(), new ArrayList<>(), List.of(), null, Set.of());
    }
}
