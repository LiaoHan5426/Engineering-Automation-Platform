package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardVerificationService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BoardVerificationControllerTest {
    @Test void exactContractRejectsCommandsResultsUnknownKeysAndWrongTypes() throws Exception {
        var type = assertDoesNotThrow(() -> Class.forName("com.lh.eap.web.controller.BoardVerificationController"));
        var service = mock(BoardVerificationService.class);
        var controller = type.getConstructor(BoardVerificationService.class).newInstance(service);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new ApiErrorHandler()).build();
        var task = UUID.randomUUID(); var run = UUID.randomUUID(); var path = "/api/board/tasks/" + task + "/runs/" + run + "/verification";
        for (var suffix : new String[]{"", "/plan"}) {
            for (var body : new String[]{"{}", "[]", "null", "{\"projectId\":\"p\",\"workspacePath\":[]}", "{\"projectId\":\"p\",\"workspacePath\":\"/repo\",\"commands\":[\"evil\"]}", "{\"projectId\":\"p\",\"workspacePath\":\"/repo\",\"result\":\"PASSED\"}"})
                mvc.perform(post(path + suffix).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        }
        verifyNoInteractions(service);
        mvc.perform(get(path).param("projectId", "p")).andExpect(status().isOk()); verify(service).get(task, run, "p");
        mvc.perform(post(path + "/plan").contentType(MediaType.APPLICATION_JSON).content("{\"projectId\":\"p\",\"workspacePath\":\"/repo\"}")).andExpect(status().isOk());
        verify(service).plan(task, run, new BoardVerificationService.Request("p", "/repo"));
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{\"projectId\":\"p\",\"workspacePath\":\"/repo\",\"planHash\":\"" + "a".repeat(64) + "\"}")).andExpect(status().isOk());
        verify(service).start(task, run, new BoardVerificationService.Start("p", "/repo", "a".repeat(64)));
    }
}
