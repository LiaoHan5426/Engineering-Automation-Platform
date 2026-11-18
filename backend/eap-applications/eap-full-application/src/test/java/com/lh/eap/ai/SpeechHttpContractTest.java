package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.nio.file.Path;
import java.util.*;
import com.lh.eap.runtime.mcp.client.McpSpeechService;
import com.lh.eap.web.*;
import com.lh.eap.web.controller.*;
import com.lh.eap.web.i18n.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.MediaType;
import org.springframework.mock.web.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SpeechHttpContractTest {
    @TempDir Path root;
    ProblemResponses problems(){return new ProblemResponses(PlatformMessagesConfiguration.source(PlatformMessagesConfiguration.PRODUCT_BASENAMES));}
    @Test void actualJsonHasFrozenUnionExplicitNullOperationFieldsAndNoStore() throws Exception {
        var engine=mock(McpSpeechService.class);when(engine.availableServices()).thenReturn(List.of(new McpSpeechService.AvailableService("voice",true,true,Set.of("audio/wav"),Set.of("audio/wav","audio/mpeg"))));
        when(engine.transcribe(anyString(),any(),any(),anyString(),any())).thenReturn("draft only");
        try(var lifecycle=new SpeechApplicationClose(new AiSpeechApplication(engine,root))){
            var mvc=MockMvcBuilders.standaloneSetup(new AiSpeechController(lifecycle.app)).setControllerAdvice(new ApiErrorHandler(problems()))
                .addFilters(new AiBrowserRequestGuard(problems()),new SpeechBodyLimitFilter(problems())).build();
            UUID id=UUID.randomUUID();
            mvc.perform(post("/api/ai/speech/transcriptions").contentType(MediaType.APPLICATION_JSON).content(AiSpeechApplicationTest.asr(id)))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.operationId").value(id.toString())).andExpect(jsonPath("$.status").value("SUCCEEDED"))
                .andExpect(jsonPath("$.result.text").value("draft only")).andExpect(jsonPath("$.result.audio").doesNotHaveJsonPath())
                .andExpect(jsonPath("$.errorCode").value(org.hamcrest.Matchers.nullValue()));
            mvc.perform(get("/api/ai/speech/operations/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.result.text").value("draft only"));
            mvc.perform(get("/api/ai/speech/services")).andExpect(status().isOk()).andExpect(jsonPath("$.services[0].transcription").value(true))
                .andExpect(jsonPath("$.services[0].inputMimes").value(org.hamcrest.Matchers.contains("audio/wav")))
                .andExpect(jsonPath("$.services[0].outputMimes").value(org.hamcrest.Matchers.containsInAnyOrder("audio/wav","audio/mpeg")))
                .andExpect(jsonPath("$.limits.maxAudioBytes").value(4194304)).andExpect(jsonPath("$.limits.maxTranscriptChars").value(16000));
            mvc.perform(get("/api/ai/speech/operations/"+UUID.randomUUID())).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("SPEECH_OPERATION_NOT_FOUND"));
            verify(engine,times(1)).transcribe(anyString(),any(),any(),anyString(),any());
        }
    }
    @Test void chunkedUnknownLengthIsBoundedBeforeMvcAndUnrelatedRoutesAreUntouched() throws Exception {
        var filter=new SpeechBodyLimitFilter(problems());
        var request=new MockHttpServletRequest("POST","/api/ai/speech/transcriptions"){
            @Override public long getContentLengthLong(){return -1;}
            @Override public int getContentLength(){return -1;}
        };
        request.setContent(new byte[SpeechBodyLimitFilter.MAX_WIRE_BYTES+1]);request.addHeader("Transfer-Encoding","chunked");
        var response=new MockHttpServletResponse();var called=new java.util.concurrent.atomic.AtomicBoolean();
        filter.doFilter(request,response,(r,s)->called.set(true));assertFalse(called.get());assertEquals(413,response.getStatus());assertTrue(response.getContentAsString().contains("SPEECH_PAYLOAD_TOO_LARGE"));
        var unrelated=new MockHttpServletRequest("POST","/api/ai/conversations");unrelated.setContent(new byte[SpeechBodyLimitFilter.MAX_WIRE_BYTES+1]);
        filter.doFilter(unrelated,new MockHttpServletResponse(),(r,s)->called.set(true));assertTrue(called.get());
    }
    @Test void boundedRequestBufferIsWipedAfterDispatchAndDeclaredOversizeNeverDispatches() throws Exception {
        var filter=new SpeechBodyLimitFilter(problems());var request=new MockHttpServletRequest("POST","/api/ai/speech/synthesis");request.setContent("secret".getBytes());
        var held=new java.util.concurrent.atomic.AtomicReference<jakarta.servlet.ServletInputStream>();
        filter.doFilter(request,new MockHttpServletResponse(),(r,s)->held.set(r.getInputStream()));assertArrayEquals(new byte[6],held.get().readAllBytes());
        var oversized=new MockHttpServletRequest("POST","/api/ai/speech/synthesis"){@Override public long getContentLengthLong(){return SpeechBodyLimitFilter.MAX_WIRE_BYTES+1L;}};
        var response=new MockHttpServletResponse();filter.doFilter(oversized,response,(r,s)->fail("Oversize body reached controller"));assertEquals(413,response.getStatus());
    }
    record SpeechApplicationClose(AiSpeechApplication app) implements AutoCloseable {public void close(){app.close();}}
}
