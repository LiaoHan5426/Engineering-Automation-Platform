package com.lh.eap.web.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.lh.eap.application.service.MissionExecution;
import com.lh.eap.application.service.MissionGitExecutionService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class MissionExecutionControllerTest {
    @Test
    void forgedPathGrantOrPrincipalDoesNotStart() throws Exception {
        var service = new MissionGitExecutionService(null, null, null, null, null, null, null) {
            int starts;

            @Override
            public MissionExecution start(UUID missionId) {
                starts++;
                return null;
            }
        };
        var missionId = UUID.randomUUID();
        var mvc = MockMvcBuilders.standaloneSetup(new MissionExecutionController(service))
                .setControllerAdvice(new ApiErrorHandler(new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES))))
                .build();
        mvc.perform(post("/api/missions/" + missionId + "/executions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"missionId\":\"" + missionId + "\",\"path\":\"F:/secret\",\"grant\":\"repository.write\",\"principal\":\"admin\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(0, service.starts);
    }

    @Test
    void resolveUnknownAcceptsOnlyNoteAndRejectsExtraFields() throws Exception {
        var captured = new String[1];
        var service = new MissionGitExecutionService(null, null, null, null, null, null, null) {
            @Override
            public MissionExecution resolveUnknown(UUID missionId, UUID executionId, String note) {
                captured[0] = note;
                return null;
            }
        };
        var missionId = UUID.randomUUID();
        var executionId = UUID.randomUUID();
        var mvc = MockMvcBuilders.standaloneSetup(new MissionExecutionController(service))
                .setControllerAdvice(new ApiErrorHandler(new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES))))
                .build();
        mvc.perform(post("/api/missions/" + missionId + "/executions/" + executionId + "/resolve-unknown")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"Reviewed process identity and logs\",\"operator\":\"admin\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(null, captured[0]);
        mvc.perform(post("/api/missions/" + missionId + "/executions/" + executionId + "/resolve-unknown")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"note\":\"Reviewed process identity and logs\"}"))
                .andExpect(status().isOk());
        assertEquals("Reviewed process identity and logs", captured[0]);
    }
}
