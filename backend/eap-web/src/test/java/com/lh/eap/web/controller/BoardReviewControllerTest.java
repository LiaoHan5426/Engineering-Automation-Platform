package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardReviewService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BoardReviewControllerTest {
    @Test void rejectsClientSuppliedDiffCommandsAndVerification() throws Exception {
        var service = mock(BoardReviewService.class); var mvc = MockMvcBuilders.standaloneSetup(new BoardReviewController(service)).setControllerAdvice(new ApiErrorHandler()).build();
        var path = "/api/board/tasks/" + UUID.randomUUID() + "/runs/" + UUID.randomUUID() + "/review";
        for (var body : new String[] { "{}", "{\"projectId\":\"p\",\"workspacePath\":[]}", "{\"projectId\":\"p\",\"workspacePath\":\"/repo\",\"diff\":\"forged\"}", "{\"projectId\":\"p\",\"workspacePath\":\"/repo\",\"check\":\"PASSED\"}" })
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void forwardsOnlyRunIdentityProjectAndConfirmedWorkspace() throws Exception {
        var service = mock(BoardReviewService.class); var mvc = MockMvcBuilders.standaloneSetup(new BoardReviewController(service)).setControllerAdvice(new ApiErrorHandler()).build();
        var task = UUID.randomUUID(); var run = UUID.randomUUID(); var path = "/api/board/tasks/" + task + "/runs/" + run + "/review";
        mvc.perform(get(path).param("projectId", "p")).andExpect(status().isOk()); verify(service).get(task, run, "p");
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{\"projectId\":\"p\",\"workspacePath\":\"/repo\"}")).andExpect(status().isOk());
        verify(service).collect(task, run, new BoardReviewService.Request("p", "/repo"));
    }
}
