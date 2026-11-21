package com.lh.eap.web.controller;

import com.lh.eap.ai.SqlExpertAgentService;
import java.util.Map;
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
    @Test void resolveUnknownAcceptsOnlyTheNoteAndPassesItToTheService() throws Exception {
        var service = mock(SqlExpertAgentService.class);
        var approvals = mock(com.lh.eap.application.service.ExpertAgentApprovalService.class);
        var id = UUID.randomUUID();
        var note = "Checked the durable file and review record manually.";
        when(approvals.resolveUnknown(eq("sql"), eq(id), eq(note)))
                .thenReturn(Map.of("state", "closed-unconfirmed"));
        var mvc = MockMvcBuilders.standaloneSetup(new SqlExpertAgentController(service, approvals)).build();
        mvc.perform(post("/api/experts/sql/agent-runs/" + id + "/resolve-unknown")
                        .contentType("application/json").content("{\"note\":\"" + note + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value("closed-unconfirmed"));
        verify(approvals).resolveUnknown("sql", id, note);
    }

    @Test void resolveUnknownRejectsExtraFieldsAndNonStringNotes() throws Exception {
        var service = mock(SqlExpertAgentService.class);
        var approvals = mock(com.lh.eap.application.service.ExpertAgentApprovalService.class);
        var id = UUID.randomUUID();
        var mvc = MockMvcBuilders.standaloneSetup(new SqlExpertAgentController(service, approvals)).build();
        var url = "/api/experts/sql/agent-runs/" + id + "/resolve-unknown";
        mvc.perform(post(url).contentType("application/json")
                        .content("{\"note\":\"checked the record\",\"operator\":\"someone\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(url).contentType("application/json").content("{\"note\":42}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(url).contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post(url)).andExpect(status().isBadRequest());
        verifyNoInteractions(approvals);
    }

    @Test void malformedExecutionIdentityNeverStartsWork() throws Exception {
        var service = mock(SqlExpertAgentService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new SqlExpertAgentController(service)).build();
        mvc.perform(post("/api/experts/reviewer/agent-runs/not-a-uuid").contentType("application/json")
                .content("{\"sql\":\"select 1\"}")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
}
