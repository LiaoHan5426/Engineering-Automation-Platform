package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardPrototypeService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BoardPrototypeControllerTest {
    @Test void rejectsForgedMetadataMissingDetachIntentAndInvalidFieldTypes() throws Exception {
        var service = mock(BoardPrototypeService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new BoardPrototypeController(service)).setControllerAdvice(new ApiErrorHandler()).build();
        var route = "/api/board/tasks/" + UUID.randomUUID() + "/prototype";
        for (var body : new String[] {
            "{\"projectId\":\"p\",\"revision\":1}",
            "{\"projectId\":\"p\",\"revision\":1,\"versionId\":null,\"contentHash\":\"forged\"}",
            "{\"projectId\":\"p\",\"revision\":1.5,\"versionId\":null}",
            "{\"projectId\":\"p\",\"revision\":1,\"versionId\":{}}",
            "{\"projectId\":\"p\",\"revision\":1,\"versionId\":\"invalid\"}"
        }) mvc.perform(post(route).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }
    @Test void acceptsExplicitNullForDetachAndOnlyPassesTheVersionIdentity() throws Exception {
        var service = mock(BoardPrototypeService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new BoardPrototypeController(service)).setControllerAdvice(new ApiErrorHandler()).build();
        var id = UUID.randomUUID(); var version = UUID.randomUUID(); var route = "/api/board/tasks/" + id + "/prototype";
        mvc.perform(post(route).contentType(MediaType.APPLICATION_JSON).content("{\"projectId\":\"p\",\"revision\":2,\"versionId\":null}")).andExpect(status().isOk());
        verify(service).select(id, new BoardPrototypeService.Selection("p", 2, null));
        mvc.perform(post(route).contentType(MediaType.APPLICATION_JSON).content("{\"projectId\":\"p\",\"revision\":3,\"versionId\":\"" + version + "\"}")).andExpect(status().isOk());
        verify(service).select(id, new BoardPrototypeService.Selection("p", 3, version));
    }
}
