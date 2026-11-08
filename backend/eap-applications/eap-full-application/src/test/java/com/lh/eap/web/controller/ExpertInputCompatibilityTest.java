package com.lh.eap.web.controller;

import com.lh.eap.application.service.ExpertExecutionService;
import com.lh.eap.local.WorkspaceSearchInput;
import com.lh.eap.sql.DatabaseEvidenceInput;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ExpertInputCompatibilityTest {
    private static final UUID PROFILE = UUID.fromString("991cdbda-5465-49bf-ad0e-b771988882f6");
    private static final String BODY = """
            {"sql":"select id from orders","question":"review","databaseId":"991cdbda-5465-49bf-ad0e-b771988882f6",
             "explainPlan":{"Node Type":"Seq Scan"},"enhanceWithModel":false,"pattern":"orders"}
            """;

    @Test void expertExecutionKeepsItsExistingJsonShape() throws Exception {
        var service = mock(ExpertExecutionService.class);
        when(service.execute(eq("reviewer"), any())).thenReturn(Map.of("status", "completed"));
        var mvc = MockMvcBuilders.standaloneSetup(new ExpertExecutionController(service)).build();
        mvc.perform(post("/api/experts/reviewer/execute").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("completed"));
        verifyInput(service, "reviewer");
    }

    @Test void sqlAnalysisKeepsDefaultExpertAndAllInputFields() throws Exception {
        var service = mock(ExpertExecutionService.class);
        when(service.execute(eq("sql-expert"), any())).thenReturn(Map.of("status", "completed"));
        var mvc = MockMvcBuilders.standaloneSetup(new SqlExpertController(service)).build();
        mvc.perform(post("/api/sql/analyze").contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("completed"));
        verifyInput(service, "sql-expert");
    }

    private static void verifyInput(ExpertExecutionService service, String expertId) {
        var capture = ArgumentCaptor.forClass(ExpertExecutionService.Request.class);
        verify(service).execute(eq(expertId), capture.capture());
        var request = capture.getValue();
        assertEquals("select id from orders", request.sql());
        assertEquals("review", request.question());
        assertEquals(Boolean.FALSE, request.enhanceWithModel());
        DatabaseEvidenceInput database = request;
        WorkspaceSearchInput search = request;
        assertEquals(PROFILE, database.databaseId());
        assertEquals(Map.of("Node Type", "Seq Scan"), database.explainPlan());
        assertEquals("orders", search.pattern());
    }
}
