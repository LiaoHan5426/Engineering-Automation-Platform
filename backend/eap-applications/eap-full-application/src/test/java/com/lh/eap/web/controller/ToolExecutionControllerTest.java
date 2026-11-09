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
        verify(service).start("git-status", id);
        mvc.perform(post(BASE.replace("git-status", "git-log")).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
    }
    @Test void bothWhitelistedOperationsDispatchWithTheirOwnIdentity() throws Exception {
        var service = mock(ToolExecutionService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service)).build();
        for (var operation : List.of("git-status", "git-diff")) {
            var base = BASE.replace("git-status", operation);
            var request = UUID.randomUUID(); var id = UUID.randomUUID();
            mvc.perform(post(base).contentType(MediaType.APPLICATION_JSON).content("{\"requestId\":\"" + request + "\"}"))
                    .andExpect(status().isAccepted());
            mvc.perform(get(base)).andExpect(status().isOk());
            mvc.perform(get(base + "/" + id)).andExpect(status().isOk());
            mvc.perform(post(base + "/" + id + "/cancel")).andExpect(status().isOk());
            verify(service).start(operation, request); verify(service).list(operation, 20);
            verify(service).get(operation, id); verify(service).cancel(operation, id);
        }
    }
    @Test void newRoutesRetainHostOriginAndContentTypeProtection() throws Exception {
        var service = mock(ToolExecutionService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service)).addFilters(new AiBrowserRequestGuard()).build();
        for (var base : List.of(BASE, BASE.replace("git-status", "git-diff"))) {
        mvc.perform(post(base).header("Host", "evil.example").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(base).header("Host", "localhost").header("Origin", "http://evil.example")
                .contentType(MediaType.APPLICATION_JSON).content("{}")) .andExpect(status().isForbidden());
        mvc.perform(post(base).header("Host", "localhost").contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        }
        verifyNoInteractions(service);
    }
}
