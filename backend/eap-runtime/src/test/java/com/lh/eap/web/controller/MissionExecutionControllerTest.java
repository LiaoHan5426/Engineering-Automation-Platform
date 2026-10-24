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
                .setControllerAdvice(new ApiErrorHandler())
                .build();
        mvc.perform(post("/api/missions/" + missionId + "/executions")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"missionId\":\"" + missionId + "\",\"path\":\"F:/secret\",\"grant\":\"repository.write\",\"principal\":\"admin\"}"))
                .andExpect(status().isBadRequest());
        assertEquals(0, service.starts);
    }
}
