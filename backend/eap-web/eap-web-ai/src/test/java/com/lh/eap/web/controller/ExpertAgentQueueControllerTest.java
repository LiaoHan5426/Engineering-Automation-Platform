package com.lh.eap.web.controller;

import com.lh.eap.ai.SqlExpertAgentScheduler;
import com.lh.eap.core.ExpertAgentJournal;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ExpertAgentQueueControllerTest {
    @Test void queueReturnsAcceptedAndListExposesDurableStateAndSchedulerAvailability() throws Exception {
        var scheduler = mock(SqlExpertAgentScheduler.class); var journal = mock(ExpertAgentJournal.class);
        when(scheduler.available()).thenReturn(true); when(journal.list(100)).thenReturn(List.of());
        var mvc = MockMvcBuilders.standaloneSetup(new ExpertAgentQueueController(scheduler, journal)).build();
        var id = UUID.randomUUID();
        mvc.perform(post("/api/experts/reviewer/agent-runs/" + id + "/queue").contentType("application/json").content("{\"sql\":\"select 1\"}"))
                .andExpect(status().isAccepted());
        verify(scheduler).enqueue(eq("reviewer"), eq(id), argThat(request -> request.sql().equals("select 1")));
        mvc.perform(get("/api/expert-agent-runs?limit=100")).andExpect(status().isOk()).andExpect(jsonPath("$.automaticScheduling").value(true));
        verify(journal).recoverExpired(); verify(journal).list(100);
    }
}
