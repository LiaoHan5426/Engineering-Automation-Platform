package com.lh.eap.web.controller;

import com.lh.eap.ai.AiSpeechApplication;
import com.lh.eap.ai.SpeechErrors;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai/speech")
public final class AiSpeechController {
    private final AiSpeechApplication speech;
    public AiSpeechController(AiSpeechApplication speech){this.speech=speech;}
    @GetMapping("/services")
    public ResponseEntity<Map<String,Object>> services(){
        var services=speech.services().stream().map(service->Map.of("serverId",service.serverId(),"transcription",service.asr(),"synthesis",service.tts(),
            "inputMimes",service.inputMimes(),"outputMimes",service.outputMimes())).toList();
        return response(Map.of("services",services,"limits",Map.of("maxAudioBytes",AiSpeechApplication.MAX_AUDIO_BYTES,"maxWireBytes",AiSpeechApplication.MAX_WIRE_BYTES,"maxTextChars",AiSpeechApplication.MAX_TEXT_CHARS,"maxTranscriptChars",com.lh.eap.runtime.mcp.client.McpSpeechService.MAX_TRANSCRIPT_CHARS)),200);
    }
    @PostMapping(value="/transcriptions",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AiSpeechApplication.Operation> transcribe(@RequestBody String body){return operationResponse(speech.transcribe(body));}
    @PostMapping(value="/synthesis",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<AiSpeechApplication.Operation> synthesize(@RequestBody String body){return operationResponse(speech.synthesize(body));}
    @GetMapping("/operations/{operationId}")
    public ResponseEntity<AiSpeechApplication.Operation> operation(@PathVariable UUID operationId){return response(speech.operation(operationId),200);}
    @PostMapping(value="/{operationId}/cancel",consumes=MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String,Object>> cancel(@PathVariable UUID operationId,@RequestBody String body){
        final Object parsed;
        try{parsed=tools.jackson.databind.json.JsonMapper.builder().enable(tools.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION).build().readValue(body,Object.class);}
        catch(RuntimeException malformed){throw invalid();}
        if(!(parsed instanceof Map<?,?> map)||!map.isEmpty())throw invalid();
        return response(speech.cancel(operationId),200);
    }
    private ResponseEntity<AiSpeechApplication.Operation> operationResponse(AiSpeechApplication.Operation operation){return response(operation,operation.status().equals("RUNNING")?202:200);}
    private <T> ResponseEntity<T> response(T body,int status){return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);}
    private ResponseStatusException invalid(){return new ResponseStatusException(HttpStatus.BAD_REQUEST,SpeechErrors.INVALID_SPEECH_REQUEST.code());}
}
