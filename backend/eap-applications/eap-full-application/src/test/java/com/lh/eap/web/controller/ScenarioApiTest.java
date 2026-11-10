package com.lh.eap.web.controller;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.lh.eap.application.service.ScenarioService;
import com.lh.eap.web.AiBrowserRequestGuard;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class ScenarioApiTest {
    @Test void dependencyObservationRejectsWritesAndForeignOriginsWithoutMutatingConfiguration() throws Exception {
        var service = mock(ScenarioService.class);
        when(service.dependencies("prototype-to-code")).thenReturn(new com.lh.eap.application.dto.ScenarioWorkflowDependencies(
                1,"prototype-to-code",java.time.Instant.now(),java.util.List.of(),java.util.List.of(),java.util.List.of()));
        var mvc=MockMvcBuilders.standaloneSetup(new ScenarioController(service))
                .setControllerAdvice(new ApiErrorHandler()).addFilters(new AiBrowserRequestGuard()).build();
        mvc.perform(get("/api/scenarios/workflows/prototype-to-code/dependencies")).andExpect(status().isOk())
                .andExpect(jsonPath("$.contractVersion").value(1));
        mvc.perform(post("/api/scenarios/workflows/prototype-to-code/dependencies")).andExpect(status().isMethodNotAllowed());
        mvc.perform(get("/api/scenarios/workflows/prototype-to-code/dependencies").header("Origin","https://evil.example"))
                .andExpect(status().isForbidden());
        verify(service).dependencies("prototype-to-code");verifyNoMoreInteractions(service);
    }
    @Test void allConfigurationWritesRejectForeignOrigins() throws Exception {
        var service = mock(ScenarioService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ScenarioController(service))
                .setControllerAdvice(new ApiErrorHandler()).addFilters(new AiBrowserRequestGuard()).build();
        mvc.perform(put("/api/scenarios/custom-test").contentType(MediaType.APPLICATION_JSON).content("{}")
                .header("Origin", "https://evil.example")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/scenarios/custom-test?revision=1").header("Origin", "https://evil.example"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(service);
    }
    @Test void deletionRequiresRevisionButNotAJsonBody() throws Exception {
        var service = mock(ScenarioService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new ScenarioController(service))
                .setControllerAdvice(new ApiErrorHandler()).addFilters(new AiBrowserRequestGuard()).build();
        mvc.perform(delete("/api/scenarios/custom-test?revision=2").header("Origin", "http://localhost:5173"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.deleted").value(true));
        verify(service).delete("custom-test", 2);
        mvc.perform(delete("/api/scenarios/custom-test")).andExpect(status().isBadRequest());
    }
}
