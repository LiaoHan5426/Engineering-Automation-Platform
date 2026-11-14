package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.nio.file.Path;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import com.lh.eap.runtime.mcp.client.McpSpeechService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class AiSpeechApplicationTest {
    @TempDir Path root;
    McpSpeechService service;AiSpeechApplication app;
    @BeforeEach void setup(){service=mock(McpSpeechService.class);when(service.availableServices()).thenReturn(List.of(new McpSpeechService.AvailableService("voice",true,true,Set.of("audio/wav"),Set.of("audio/wav","audio/mpeg"))));app=new AiSpeechApplication(service,root);}
    @AfterEach void close(){app.close();}
    @Test void transcriptionIsDraftOnlyDeduplicatesAndWipesInput() {
        var received=new AtomicReference<byte[]>();
        when(service.transcribe(anyString(),any(),any(),anyString(),any())).thenAnswer(call->{received.set(call.getArgument(2));return "draft".repeat(1000);});
        UUID id=UUID.randomUUID();String body=asr(id);
        var result=app.transcribe(body);assertEquals("SUCCEEDED",result.status());assertEquals(5000,result.result().text().length());assertNull(result.result().audio());
        assertArrayEquals(new byte[12],received.get());assertEquals(result,app.transcribe(body));assertEquals(result,app.operation(id));
        verify(service,times(1)).transcribe(anyString(),any(),any(),anyString(),any());
        assertEquals("SPEECH_OPERATION_CONFLICT",assertThrows(ResponseStatusException.class,()->app.synthesize(tts(id,"changed"))).getReason());
    }
    @Test void synthesisCachesOnlyItsOwnCopyAndExpiryWipesIt() {
        var now=new AtomicReference<>(Instant.parse("2026-01-01T00:00:00Z"));app.close();app=new AiSpeechApplication(service,root,now::get);
        byte[] bytes="RIFF0000WAVE".getBytes(java.nio.charset.StandardCharsets.US_ASCII);String expected=Base64.getEncoder().encodeToString(bytes);
        var output=mock(McpSpeechService.Audio.class);when(output.bytes()).thenReturn(bytes);when(output.mimeType()).thenReturn("audio/wav");doAnswer(call->{Arrays.fill(bytes,(byte)0);return null;}).when(output).close();
        when(service.synthesize(anyString(),any(),anyString(),any())).thenReturn(output);
        UUID id=UUID.randomUUID();var result=app.synthesize(tts(id,"read this"));assertEquals(expected,result.result().audio().base64());assertArrayEquals(new byte[12],bytes);
        var entries=(Map<?,?>)ReflectionTestUtils.getField(app,"entries");var entry=entries.get(id);byte[] cached=(byte[])ReflectionTestUtils.getField(entry,"audio");
        now.set(now.get().plus(Duration.ofMinutes(11)));ReflectionTestUtils.invokeMethod(app,"expire");assertArrayEquals(new byte[12],cached);
        assertEquals("SPEECH_OPERATION_NOT_FOUND",assertThrows(ResponseStatusException.class,()->app.operation(id)).getReason());
    }
    @Test void twoInflightLimitAndCancellationAreOperationScoped() throws Exception {
        var entered=new CountDownLatch(2);var release=new CountDownLatch(1);
        when(service.transcribe(anyString(),any(),any(),anyString(),any())).thenAnswer(call->{entered.countDown();assertTrue(release.await(5,TimeUnit.SECONDS));return "draft";});
        UUID first=UUID.randomUUID(),second=UUID.randomUUID();
        try(var threads=Executors.newVirtualThreadPerTaskExecutor()) {
            var a=threads.submit(()->app.transcribe(asr(first)));var b=threads.submit(()->app.transcribe(asr(second)));
            try {
                assertTrue(entered.await(5,TimeUnit.SECONDS));assertEquals("RUNNING",app.transcribe(asr(first)).status());
                assertEquals("SPEECH_CAPACITY_EXCEEDED",assertThrows(ResponseStatusException.class,()->app.transcribe(asr(UUID.randomUUID()))).getReason());
                assertEquals(true,app.cancel(first).get("cancelRequested"));verify(service,times(1)).cancel(any());
            } finally {release.countDown();}
            assertEquals("CANCELLED",a.get(5,TimeUnit.SECONDS).status());assertEquals("SUCCEEDED",b.get(5,TimeUnit.SECONDS).status());
            assertEquals(false,app.cancel(first).get("cancelRequested"));verify(service,times(1)).cancel(any());
        }finally{release.countDown();}
    }
    @Test void acceptedProviderFailureIsQueryableAndNeverAutomaticallyRetried() {
        when(service.transcribe(anyString(),any(),any(),anyString(),any())).thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,"MCP_TOOL_FAILED"));
        UUID id=UUID.randomUUID();var result=app.transcribe(asr(id));assertEquals("FAILED",result.status());assertEquals("MCP_TOOL_FAILED",result.errorCode());
        assertEquals(result,app.transcribe(asr(id)));verify(service,times(1)).transcribe(anyString(),any(),any(),anyString(),any());
    }
    static String asr(UUID id){return JsonMapper.builder().build().writeValueAsString(Map.of("operationId",id,"serverId","voice","audio",Map.of("mime","audio/wav","base64",Base64.getEncoder().encodeToString("RIFF0000WAVE".getBytes(java.nio.charset.StandardCharsets.US_ASCII)))));}
    static String tts(UUID id,String text){return JsonMapper.builder().build().writeValueAsString(Map.of("operationId",id,"serverId","voice","text",text));}
}
