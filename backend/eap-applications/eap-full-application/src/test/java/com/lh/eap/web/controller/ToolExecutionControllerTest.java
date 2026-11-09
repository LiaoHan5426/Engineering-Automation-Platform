package com.lh.eap.web.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.lh.eap.application.service.ToolExecutionService;
import com.lh.eap.web.AiBrowserRequestGuard;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ToolExecutionControllerTest {
    static final String BASE = "/api/cli-programs/git/operations/git-status/executions";
    @Test void onlyTheFixedOperationAndRequestIdAreAccepted() throws Exception {
        var service = mock(ToolExecutionService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service)).build();
        for (var body : List.of("{}", "{\"requestId\":\"invalid\"}", "{\"requestId\":\"" + UUID.randomUUID() + "\",\"cwd\":\"/tmp\"}"))
            mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
        var id = UUID.randomUUID();
        mvc.perform(post(BASE).contentType(MediaType.APPLICATION_JSON).content("{\"requestId\":\"" + id + "\"}"))
                .andExpect(status().isAccepted());
        verify(service).start(id);
        mvc.perform(post(BASE.replace("git-status", "git-diff")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
    }
    @Test void newRoutesRetainHostOriginAndContentTypeProtection() throws Exception {
        var service = mock(ToolExecutionService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service)).addFilters(new AiBrowserRequestGuard()).build();
        mvc.perform(post(BASE).header("Host", "evil.example").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(BASE).header("Host", "localhost").header("Origin", "http://evil.example")
                .contentType(MediaType.APPLICATION_JSON).content("{}")) .andExpect(status().isForbidden());
        mvc.perform(post(BASE).header("Host", "localhost").contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        verifyNoInteractions(service);
    }
}
