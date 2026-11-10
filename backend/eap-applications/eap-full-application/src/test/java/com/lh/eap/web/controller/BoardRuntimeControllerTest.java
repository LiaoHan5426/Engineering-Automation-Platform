package com.lh.eap.web.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.lh.eap.application.service.BoardRuntimeService;
import com.lh.eap.web.AiBrowserRequestGuard;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class BoardRuntimeControllerTest {
    @Test void readOnlyProjectSnapshotAndBoundedFailureAreIndependentOfPluginInstallation() throws Exception {
        var service=mock(BoardRuntimeService.class);
        when(service.inspect("one")).thenReturn(new BoardRuntimeService.Snapshot("one",Instant.now(),1,2,1,0,0,0,0,0,List.of(),false));
        when(service.inspect(" ")).thenThrow(new IllegalArgumentException("private"));
        when(service.inspect("unavailable")).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("private SQL"));
        var mvc=MockMvcBuilders.standaloneSetup(new BoardRuntimeController(service, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).addFilters(new AiBrowserRequestGuard(new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
        mvc.perform(get("/api/board/runtime").param("projectId","one")).andExpect(status().isOk())
                .andExpect(jsonPath("$.projectId").value("one")).andExpect(jsonPath("$.activeRunCount").value(1));
        mvc.perform(get("/api/board/runtime").param("projectId"," ")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/board/runtime").param("projectId","unavailable")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("BOARD_RUNTIME_OBSERVATION_UNAVAILABLE"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("private"))));
        mvc.perform(post("/api/board/runtime").param("projectId","one")).andExpect(status().isMethodNotAllowed());
        mvc.perform(get("/api/board/runtime").param("projectId","one").header("Origin","http://evil.example"))
                .andExpect(status().isForbidden());
        verify(service).inspect("one");verify(service).inspect(" ");verify(service).inspect("unavailable");verifyNoMoreInteractions(service);
    }
}
