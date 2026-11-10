package com.lh.eap.web;
import com.lh.eap.error.ChatErrors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.lh.eap.ai.AiChatApplication;
import com.lh.eap.ai.dto.ChatExecutionEvent;
import com.lh.eap.ai.dto.ChatExecutionSnapshot;
import com.lh.eap.application.service.*;
import com.lh.eap.error.*;
import com.lh.eap.web.controller.*;
import com.lh.eap.web.i18n.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class PlatformProblemContractTest {
    private final ProblemResponses problems = new ProblemResponses(PlatformMessagesConfiguration.source(PlatformMessagesConfiguration.PRODUCT_BASENAMES));

    @RestController static class Probe {
        @GetMapping("/api/probe/conflict") Object conflict() { throw new ResponseStatusException(HttpStatus.CONFLICT, CodeErrors.FILE_CHANGED_SINCE_PROPOSAL.code()); }
        @GetMapping("/api/probe/private") Object privateFailure() { throw new IllegalArgumentException("private SQL and provider credentials must not become user copy"); }
        @PostMapping("/api/probe/json") Object json(@RequestBody Map<String,Object> body) { return body; }
        @GetMapping("/api/probe/clear") Object cleared() {
            var failure = new ResponseStatusException(HttpStatus.CONFLICT, ChatErrors.CONVERSATION_WORKSPACE_CHANGED.code());
            failure.getBody().setProperty("knowledgeMemoryCleared", true); failure.getBody().setProperty("contextMemoryCleared", true); throw failure;
        }
        @GetMapping("/api/probe/limit") Object limit() { throw new LocalizedFailure(LocalizedFailure.Kind.INVALID, CodeErrors.CODE_GRAPH_CONTEXT_TOO_LARGE, 48000); }
    }

    @Test void oneMachineErrorHasDifferentLocalizedCopyAndDoesNotExposeInternalMessages() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new ApiErrorHandler(problems)).build();
        String zh = mvc.perform(get("/api/probe/conflict").header("Accept-Language","zh-CN"))
                .andExpect(status().isConflict()).andExpect(header().string("Content-Language","zh-CN"))
                .andExpect(jsonPath("$.code").value("FILE_CHANGED_SINCE_PROPOSAL")).andExpect(jsonPath("$.requestId").isString()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        String en = mvc.perform(get("/api/probe/conflict").header("Accept-Language","de;q=1,en-GB;q=0.9,zh;q=0.1"))
                .andExpect(status().isConflict()).andExpect(header().string("Content-Language","en-US"))
                .andExpect(jsonPath("$.code").value("FILE_CHANGED_SINCE_PROPOSAL")).andReturn().getResponse().getContentAsString();
        var json=JsonMapper.builder().build(); assertNotEquals(json.readTree(zh).path("detail"),json.readTree(en).path("detail"));
        assertTrue(zh.contains("文件")); assertTrue(en.contains("changed since"));
        String safe = mvc.perform(get("/api/probe/private").header("Accept-Language","en"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST")).andReturn().getResponse().getContentAsString();
        assertFalse(safe.contains("credentials")); assertFalse(safe.contains("private SQL"));
        mvc.perform(post("/api/probe/json").contentType(MediaType.APPLICATION_JSON).content("{broken"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_JSON"));
    }

    @Test void filterAndLocalHandlersUseTheSameEnvelopeAndRetainUncertaintyContext() throws Exception {
        var service=mock(ToolExecutionService.class);var id=UUID.randomUUID();
        var row=new ToolExecution(id,UUID.randomUUID(),"git","git-status","workspace","git","UNKNOWN",false,Instant.now(),null,null,"","",false,null,"result missing",List.of());
        when(service.start(eq("git-status"),any())).thenThrow(new ToolExecutionService.Blocked(row));
        var mvc=MockMvcBuilders.standaloneSetup(new ToolExecutionController(service,problems),new Probe())
                .setControllerAdvice(new ApiErrorHandler(problems)).addFilters(new AiBrowserRequestGuard(problems)).build();
        mvc.perform(get("/api/probe/conflict").header("Host","evil.example").header("Accept-Language","en-US"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("HOST_REJECTED")).andExpect(jsonPath("$.requestId").isString()).andExpect(header().string("Content-Language","en-US"));
        mvc.perform(post("/api/cli-programs/git/operations/git-status/executions").contentType(MediaType.APPLICATION_JSON)
                        .header("Accept-Language","en").content("{\"requestId\":\""+UUID.randomUUID()+"\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("TOOL_EXECUTION_BLOCKED"))
                .andExpect(jsonPath("$.execution.id").value(id.toString())).andExpect(jsonPath("$.execution.status").value("UNKNOWN"));
        mvc.perform(get("/api/probe/clear"))
                .andExpect(jsonPath("$.knowledgeMemoryCleared").value(true)).andExpect(jsonPath("$.contextMemoryCleared").value(true));
    }

    @Test void publicArgumentsAndLocaleFallbackAreDeterministic() throws Exception {
        var mvc=MockMvcBuilders.standaloneSetup(new Probe()).setControllerAdvice(new ApiErrorHandler(problems)).build();
        var response=mvc.perform(get("/api/probe/limit").header("Accept-Language","en-US"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CODE_GRAPH_CONTEXT_TOO_LARGE")).andReturn().getResponse();
        assertTrue(response.getContentAsString().contains("48,000")); assertFalse(response.getContentAsString().contains("{0"));
        assertEquals(RequestLanguage.CHINESE,RequestLanguage.resolve("fr-FR"));
        assertEquals(RequestLanguage.CHINESE,RequestLanguage.resolve("invalid;q=wrong"));
        assertEquals(RequestLanguage.ENGLISH,RequestLanguage.resolve("zh;q=0,en;q=0.5"));
    }

    @Test void sseCapturesRequestLanguageAcrossWorkersAndSnapshotRereadsWithoutMutatingTheJournal() throws Exception {
        var app=mock(AiChatApplication.class);UUID conversation=UUID.randomUUID(),execution=UUID.randomUUID();
        var event=ChatExecutionEvent.of(1,execution,conversation,null,"error","original evidence","AI_PROVIDER_ERROR","FAILED",null);
        var snapshot=new ChatExecutionSnapshot(execution,conversation,1,true,"FAILED",List.of(event));
        when(app.executionSnapshot(eq(conversation),eq(execution),eq(0L))).thenReturn(snapshot);
        when(app.sendDetached(eq(conversation),anyString(),any())).thenAnswer(call->{
            Consumer<ChatExecutionEvent> observer=call.getArgument(2);
            var done=CompletableFuture.<com.lh.eap.ai.dto.AiMessageResponse>supplyAsync(()->{observer.accept(event);return null;});
            return new AiChatApplication.RunningTurn(CompletableFuture.completedFuture(null),done);
        });
        var mvc=MockMvcBuilders.standaloneSetup(new AiChatController(app,problems)).setControllerAdvice(new ApiErrorHandler(problems)).build();
        var started=mvc.perform(post("/api/ai/conversations/"+conversation+"/messages").header("Accept-Language","en-US")
                .contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"fixture\"}")).andReturn();
        started.getAsyncResult(5000);
        String stream=mvc.perform(asyncDispatch(started)).andExpect(header().string("Content-Language","en-US")).andReturn().getResponse().getContentAsString();
        assertTrue(stream.contains("The model provider"));assertTrue(stream.contains("original evidence"));assertTrue(stream.contains("AI_PROVIDER_ERROR"));
        mvc.perform(get("/api/ai/conversations/"+conversation+"/executions/"+execution+"/snapshot").header("Accept-Language","zh-CN"))
                .andExpect(header().string("Content-Language","zh-CN")).andExpect(jsonPath("$.events[0].message").value("模型服务未能完成请求，请检查连接及执行记录。"));
        assertEquals("original evidence",snapshot.events().getFirst().text());assertEquals("AI_PROVIDER_ERROR",snapshot.events().getFirst().code());
    }
}
