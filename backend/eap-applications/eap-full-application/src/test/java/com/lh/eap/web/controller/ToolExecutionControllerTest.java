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
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
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
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
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
            mvc.perform(get(base + "/" + id + "/process-review")).andExpect(status().isOk());
            verify(service).inspectProcesses(operation, id);
        }
    }
    @Test void readinessIsScopedAndStorageFailuresNeverExposeSqlOrImplyRollback() throws Exception {
        var service = mock(ToolExecutionService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
        for (var operation : List.of("git-status", "git-diff")) {
            var base = BASE.replace("git-status", operation);
            mvc.perform(get(base + "/readiness")).andExpect(status().isOk());
            verify(service).readiness(operation);
            when(service.list(operation, 20)).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("private SQL and connection detail"));
            mvc.perform(get(base)).andExpect(status().isServiceUnavailable())
                    .andExpect(jsonPath("$.code").value("TOOL_EXECUTION_STORE_UNAVAILABLE"))
                    .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("private"))));
        }
        doThrow(new org.springframework.dao.DataAccessResourceFailureException("private commit detail")).when(service).list("git-status", 20);
        mvc.perform(get(BASE)).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.code").value("TOOL_EXECUTION_STORE_UNAVAILABLE"));
        mvc.perform(get(BASE.replace("git-status", "git-log") + "/readiness")).andExpect(status().isNotFound());
    }
    @Test void unknownReviewOnlyAcceptsExplicitBoundedReviewInput() throws Exception {
        var service = mock(ToolExecutionService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
        var id = UUID.randomUUID(); var request = UUID.randomUUID();
        for (var operation : List.of("git-status", "git-diff")) {
            var url = BASE.replace("git-status", operation) + "/" + id + "/resolve-unknown";
            for (var body : List.of("{}", "{\"requestId\":\"" + request + "\",\"note\":\"Reviewed process tree\",\"processTreeStopped\":false}",
                    "{\"requestId\":\"" + request + "\",\"note\":\"Reviewed process tree\",\"processTreeStopped\":true,\"operator\":\"admin\"}",
                    "{\"requestId\":\"invalid\",\"note\":\"Reviewed process tree\",\"processTreeStopped\":true}"))
                mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
            mvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content("{\"requestId\":\"" + request
                    + "\",\"note\":\"Reviewed process tree\",\"processTreeStopped\":true}")).andExpect(status().isOk());
            verify(service).resolveUnknown(operation, id, request, "Reviewed process tree", true);
        }
        verifyNoMoreInteractions(service);
    }
    @Test void newRoutesRetainHostOriginAndContentTypeProtection() throws Exception {
        var service = mock(ToolExecutionService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ToolExecutionController(service, new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).addFilters(new AiBrowserRequestGuard(new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
        for (var operation : List.of("git-status", "git-diff")) {
        for (var suffix : List.of("", "/" + UUID.randomUUID() + "/resolve-unknown")) {
        var base = BASE.replace("git-status", operation) + suffix;
        mvc.perform(post(base).header("Host", "evil.example").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post(base).header("Host", "localhost").header("Origin", "http://evil.example")
                .contentType(MediaType.APPLICATION_JSON).content("{}")) .andExpect(status().isForbidden());
        mvc.perform(post(base).header("Host", "localhost").contentType(MediaType.TEXT_PLAIN).content("{}"))
                .andExpect(status().isUnsupportedMediaType());
        }
        }
        verifyNoInteractions(service);
    }
}
