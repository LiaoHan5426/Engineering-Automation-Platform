package com.lh.eap.web.controller;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import com.lh.eap.application.service.BoardCodeProposalService;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
class BoardCodeProposalControllerTest {
 @Test void readsExactTaskScopeAndRejectsForgedIdentityOrMissingConfirmation()throws Exception {
  var service=mock(BoardCodeProposalService.class);var mvc=MockMvcBuilders.standaloneSetup(new BoardCodeProposalController(service)).setControllerAdvice(new ApiErrorHandler(new com.lh.eap.web.i18n.ProblemResponses(com.lh.eap.web.i18n.PlatformMessagesConfiguration.source(com.lh.eap.web.i18n.PlatformMessagesConfiguration.PRODUCT_BASENAMES)))).build();
  var task=UUID.randomUUID();var proposal=UUID.randomUUID();String path="/api/board/tasks/"+task+"/code-proposals";
  mvc.perform(get(path).param("projectId","project")).andExpect(status().isOk());verify(service).list(task,"project");
  mvc.perform(get(path+"/"+proposal).param("projectId","project")).andExpect(status().isOk());verify(service).get(task,proposal,"project");clearInvocations(service);
  for(String body:List.of("{}","[]","null","{\"projectId\":\"project\",\"revision\":1,\"confirmed\":false}","{\"projectId\":\"project\",\"revision\":1.5,\"confirmed\":true}","{\"projectId\":\"project\",\"revision\":1,\"confirmed\":true,\"conversationId\":\"forged\"}"))
   mvc.perform(post(path+"/"+proposal+"/apply").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isBadRequest());
  verifyNoInteractions(service);
  String action="{\"projectId\":\"project\",\"revision\":2,\"confirmed\":true}";
  mvc.perform(post(path+"/"+proposal+"/apply").contentType(MediaType.APPLICATION_JSON).content(action)).andExpect(status().isOk());verify(service).apply(task,proposal,new BoardCodeProposalService.Action("project",2,true));
  mvc.perform(post(path+"/"+proposal+"/refuse").contentType(MediaType.APPLICATION_JSON).content(action)).andExpect(status().isOk());verify(service).refuse(task,proposal,new BoardCodeProposalService.Action("project",2,true));
 }
}
