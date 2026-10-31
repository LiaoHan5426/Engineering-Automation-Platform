package com.lh.eap.web.controller;

import com.lh.eap.application.service.BoardDeliveryService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class BoardDeliveryControllerTest {
    @Test void exactContractRejectsFabricatedEvidenceAndCoercedValuesBeforeCallingService() throws Exception {
        var type = assertDoesNotThrow(() -> Class.forName("com.lh.eap.web.controller.BoardDeliveryController"));
        var service = mock(BoardDeliveryService.class);
        var mvc = MockMvcBuilders.standaloneSetup(type.getConstructor(BoardDeliveryService.class).newInstance(service)).setControllerAdvice(new ApiErrorHandler()).build();
        var task = UUID.randomUUID(); var run = UUID.randomUUID(); var request = UUID.randomUUID(); var delivery = UUID.randomUUID();
        String path = "/api/board/tasks/"+task+"/runs/"+run+"/delivery";
        String body = "{\"projectId\":\"p\",\"revision\":1,\"workspacePath\":\"repo\",\"requestId\":\""+request+"\",\"paths\":[\"frontend/source.ts\"],\"note\":\"manual\"}";
        String decision = "{\"projectId\":\"p\",\"revision\":2,\"requestId\":\""+request+"\",\"deliveryId\":\""+delivery+"\",\"decision\":\"ACCEPT\",\"criteriaConfirmed\":true,\"previewConfirmed\":true,\"comment\":\"reviewed\"}";
        for (String invalid : List.of("{}", "[]", "null", body.replace("\"revision\":1", "\"revision\":1.2"), body.replace("\"revision\":1", "\"revision\":\"1\""), body.replace("\"note\":\"manual\"", "\"note\":\"manual\",\"sourceHash\":\"fake\""), body.replace("[\"frontend/source.ts\"]", "[1]"), body.replace(request.toString(),"1-1-1-1-1")))
            mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(invalid)).andExpect(status().isBadRequest());
        mvc.perform(post(path+"/decision").contentType(MediaType.APPLICATION_JSON).content(decision.replace("\"criteriaConfirmed\":true", "\"criteriaConfirmed\":\"true\""))).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
        mvc.perform(get(path).param("projectId","p")).andExpect(status().isOk()); verify(service).get(task,run,"p");
        mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isOk()); verify(service).submit(task,run,new BoardDeliveryService.Request("p",1,"repo",request,List.of("frontend/source.ts"),"manual"));
        mvc.perform(post(path+"/decision").contentType(MediaType.APPLICATION_JSON).content(decision)).andExpect(status().isOk()); verify(service).decide(task,run,new BoardDeliveryService.Decide("p",2,request,delivery,"ACCEPT",true,true,"reviewed"));
    }
}
