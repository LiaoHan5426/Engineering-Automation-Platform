package com.lh.eap.runtime.mcp.client;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.runtime.mcp.McpSessionRegistry;
import java.util.*;
import org.junit.jupiter.api.Test;

class McpSpeechServiceTest {
    final McpServerRegistry registry=mock(McpServerRegistry.class);
    final McpSessionRegistry sessions=new McpSessionRegistry();
    final McpClientService client=new McpClientService(registry,sessions);
    final McpSpeechService service=new McpSpeechService(client);
    static byte[] wav(){return new byte[]{'R','I','F','F',4,0,0,0,'W','A','V','E'};}
    void setup(McpOperationBinding.Speech binding,Map<String,Object> output){
        var config=new McpServerRegistry.OperationBindings(1,"fixture","http",List.of(binding));
        when(registry.operationBindings("chosen")).thenReturn(config);
        var server=new McpServerRegistry.McpServer("chosen","Chosen","http","fixture",true,true,List.of(binding.tool()));
        when(registry.find("chosen")).thenReturn(Optional.of(server));when(registry.usableServers()).thenReturn(List.of(server));
        when(registry.grants("voice-expert")).thenReturn(List.of("mcp.chosen."+binding.tool()));
        client.registerInMemoryTransport("chosen",()->new McpTransport(){
            public String exchange(String request,java.time.Duration timeout){
                var json=tools.jackson.databind.json.JsonMapper.builder().build();var row=json.readValue(request,Map.class);
                var method=row.get("method");if(method.equals("notifications/initialized"))return "";
                Object result=method.equals("initialize")?Map.of("protocolVersion",McpProtocolClient.PROTOCOL_VERSION)
                        :method.equals("tools/list")?Map.of("tools",List.of(Map.of("name",binding.tool(),"inputSchema",binding.inputSchema()))):output;
                return json.writeValueAsString(Map.of("jsonrpc","2.0","id",row.get("id"),"result",result));
            }
            public void close(){}
        });
    }
    McpOperationBinding.Speech asr(){return (McpOperationBinding.Speech)McpOperationBinding.parse(new HashMap<>(McpOperationBindingsTest.asr()){{put("approved",true);}});}
    @Test void actualProtocolTranscriptionUsesConfiguredExpertAndClosesTransientScope(){
        setup(asr(),Map.of("structuredContent",Map.of("transcript","actual fixture transcript")));
        assertEquals("actual fixture transcript",service.transcribe("chosen",UUID.randomUUID(),wav(),"audio/wav",()->true));
        assertEquals(0,sessions.openSessionCount());
    }
    @Test void revokedOffMalformedAndOversizedAudioNeverOpenTransport(){
        setup(asr(),Map.of());
        assertThrows(Exception.class,()->service.transcribe("chosen",UUID.randomUUID(),wav(),"audio/wav",()->false));
        assertThrows(Exception.class,()->service.transcribe("chosen",UUID.randomUUID(),new byte[12],"audio/wav",()->true));
        assertThrows(Exception.class,()->service.transcribe("chosen",UUID.randomUUID(),new byte[McpSpeechService.MAX_AUDIO_BYTES+1],"audio/wav",()->true));
        assertEquals(0,sessions.openSessionCount());
    }
    @Test void nativeAudioTtsDecodesCanonicalBase64AndZeroesOnClose(){
        var schema=Map.<String,Object>of("type","object","properties",Map.of("text",Map.of("type","string")));
        var binding=new McpOperationBinding.Speech(McpOperationBinding.Operation.TTS,"speak","voice-expert",true,schema,"","","text","","audio","mime","AUDIO");
        setup(binding,Map.of("content",List.of(Map.of("type","audio","data",Base64.getEncoder().encodeToString(wav()),"mimeType","audio/wav"))));
        byte[] bytes;
        try(var audio=service.synthesize("chosen",UUID.randomUUID(),"speak only this",()->true)){
            bytes=audio.bytes();assertArrayEquals(wav(),bytes);assertEquals("audio/wav",audio.mimeType());
        }
        assertArrayEquals(new byte[12],bytes);assertEquals(0,sessions.openSessionCount());
    }
    @Test void mimeEnumConstrainsAvailabilityAndRejectsUnacceptedAudioBeforeProtocol(){
        var schema=Map.<String,Object>of("type","object","properties",Map.of("audio",Map.of("type","string"),"mime",Map.of("type","string","enum",List.of("audio/wav"))));
        var binding=new McpOperationBinding.Speech(McpOperationBinding.Operation.ASR,"transcribe","voice-expert",true,schema,"audio","mime","","transcript","","","JSON");
        setup(binding,Map.of("structuredContent",Map.of("transcript","actual transcript")));
        assertEquals(Set.of("audio/wav"),service.availableServices().getFirst().inputMimes());
        assertTrue(service.availableServices().getFirst().outputMimes().isEmpty());
        byte[] webm={(byte)0x1a,0x45,(byte)0xdf,(byte)0xa3};
        assertThrows(Exception.class,()->service.transcribe("chosen",UUID.randomUUID(),webm,"audio/webm",()->true));
        assertEquals(0,sessions.openSessionCount());
        assertEquals("actual transcript",service.transcribe("chosen",UUID.randomUUID(),wav(),"audio/wav",()->true));
    }
    @Test void malformedMimeEnumIsRejectedWhenSavingBinding(){
        var raw=new HashMap<>(McpOperationBindingsTest.asr());
        raw.put("inputSchema",Map.of("type","object","properties",Map.of("audio",Map.of("type","string"),"mime",Map.of("type","string","enum",List.of(42)))));
        assertThrows(IllegalArgumentException.class,()->McpOperationBinding.parse(raw));
    }
    @Test void globalCapabilityOffPreventsVoiceAvailabilityAndDispatch(){
        setup(asr(),Map.of());
        var disabled=new McpSpeechService(new McpClientService(registry,sessions,capability->false));
        assertTrue(disabled.availableServices().isEmpty());
        assertThrows(Exception.class,()->disabled.transcribe("chosen",UUID.randomUUID(),wav(),"audio/wav",()->true));
    }
}
