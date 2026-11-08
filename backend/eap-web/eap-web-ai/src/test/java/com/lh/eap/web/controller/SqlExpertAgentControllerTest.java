package com.lh.eap.web.controller;

import com.lh.eap.ai.SqlExpertAgentService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SqlExpertAgentControllerTest {
    @Test void persistedReviewAndResumeAreExplicitSeparateOperations() throws Exception {
        var service = mock(SqlExpertAgentService.class);
        var approvals = mock(com.lh.eap.application.service.ExpertAgentApprovalService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SqlExpertAgentController(service, approvals)).build();
        var id = UUID.randomUUID(); var proposal = UUID.randomUUID();
        var url = "/api/experts/reviewer/agent-runs/" + id;
        mvc.perform(get(url)).andExpect(status().isOk());
        verify(approvals).inspect("reviewer", id);
        mvc.perform(post(url + "/resume")).andExpect(status().isOk());
        verify(service).resume("reviewer", id);
        mvc.perform(post(url + "/approval").contentType("application/json")
                .content("{\"proposalId\":\"" + proposal + "\",\"digest\":\"bound-digest\",\"approve\":true}"))
                .andExpect(status().isOk());
        verify(approvals).review("reviewer", id, new com.lh.eap.application.service.ExpertAgentApprovalService.Review(proposal, "bound-digest", true));
        verify(service, never()).execute(any(), any(), any());
    }
    @Test void executionAndCancellationUseExplicitExpertAndRunIdentity() throws Exception {
        var service = mock(SqlExpertAgentService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SqlExpertAgentController(service)).build();
        var id = UUID.randomUUID();
        mvc.perform(post("/api/experts/reviewer/agent-runs/" + id).contentType("application/json")
                .content("{\"sql\":\"select 1\",\"question\":\"Review\"}")).andExpect(status().isOk());
        verify(service).execute(eq("reviewer"), eq(id), argThat(request -> request.sql().equals("select 1")));
        when(service.cancel("reviewer", id)).thenReturn(true);
        mvc.perform(delete("/api/experts/reviewer/agent-runs/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.cancelRequested").value(true));
        verify(service).cancel("reviewer", id);
    }
    @Test void malformedExecutionIdentityNeverStartsWork() throws Exception {
        var service = mock(SqlExpertAgentService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SqlExpertAgentController(service)).build();
        mvc.perform(post("/api/experts/reviewer/agent-runs/not-a-uuid").contentType("application/json")
                .content("{\"sql\":\"select 1\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
