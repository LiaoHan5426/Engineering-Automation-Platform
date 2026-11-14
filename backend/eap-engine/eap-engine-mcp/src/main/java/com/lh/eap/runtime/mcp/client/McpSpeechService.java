package com.lh.eap.runtime.mcp.client;

import com.lh.eap.error.McpErrors;
import java.util.*;
import java.util.function.BooleanSupplier;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Explicit transient audio forwarding. Audio is never written, logged, traced, or passed to a model. */
@Service
public final class McpSpeechService {
    public static final int MAX_AUDIO_BYTES=4*1024*1024;
    public static final int MAX_TEXT_CHARS=4000;
    public static final int MAX_TRANSCRIPT_CHARS=16000;
    public static final Set<String> SUPPORTED_AUDIO_MIMES=Set.of("audio/wav","audio/mpeg","audio/ogg","audio/webm");
    private static final int MAX_BASE64_CHARS=4*((MAX_AUDIO_BYTES+2)/3);
    private final McpClientService client;
    private final JsonMapper json=JsonMapper.builder().build();
    public McpSpeechService(McpClientService client){this.client=client;}
    public record AvailableService(String serverId,boolean asr,boolean tts,Set<String> inputMimes,Set<String> outputMimes){
        public AvailableService { inputMimes=Set.copyOf(inputMimes);outputMimes=Set.copyOf(outputMimes); }
    }
    static Set<String> inputMimes(McpOperationBinding.Speech binding) {
        if(!(binding.inputSchema().get("properties") instanceof Map<?,?> properties)
                || !(properties.get(binding.mimeArgument()) instanceof Map<?,?> mime)
                || !"string".equals(mime.get("type")))throw invalid();
        if(!mime.containsKey("enum"))return SUPPORTED_AUDIO_MIMES;
        if(!(mime.get("enum") instanceof List<?> values) || values.isEmpty() || values.size()>32)throw invalid();
        var accepted=new HashSet<String>();
        for(var value:values) {
            if(!(value instanceof String text) || text.isBlank() || text.length()>80)throw invalid();
            if(SUPPORTED_AUDIO_MIMES.contains(text))accepted.add(text);
        }
        return Set.copyOf(accepted);
    }
    public static final class Audio implements AutoCloseable {
        private final byte[] bytes;private final String mimeType;
        Audio(byte[]bytes,String mimeType){this.bytes=bytes;this.mimeType=mimeType;}
        public byte[] bytes(){return bytes;}
        public String mimeType(){return mimeType;}
        public void close(){Arrays.fill(bytes,(byte)0);}
    }
    public List<AvailableService> availableServices(){
        var result=new ArrayList<AvailableService>();
        for(var server:client.registry().usableServers()){
            if(!Set.of("http","stdio").contains(server.transport()))continue;
            boolean asr=false,tts=false;Set<String> inputs=Set.of();
            for(var b:client.registry().operationBindings(server.id()).bindings())
                if(b instanceof McpOperationBinding.Speech speech && client.mappedAuthorized(client.mapped(server.id(),b.operation()),()->true)){
                    if(b.operation()==McpOperationBinding.Operation.ASR){inputs=inputMimes(speech);asr=!inputs.isEmpty();}
                    tts|=b.operation()==McpOperationBinding.Operation.TTS;
                }
            if(asr||tts)result.add(new AvailableService(server.id(),asr,tts,inputs,tts?SUPPORTED_AUDIO_MIMES:Set.of()));
        }
        return List.copyOf(result);
    }
    public String transcribe(String serverId,UUID invocationId,byte[] audio,String mimeType,BooleanSupplier live){
        if(audio==null||audio.length==0||audio.length>MAX_AUDIO_BYTES)throw invalid();
        requireAudio(audio,mimeType);
        var selected=select(serverId,McpOperationBinding.Operation.ASR,live);
        var b=(McpOperationBinding.Speech)selected.binding();
        if(!inputMimes(b).contains(mimeType))throw invalid();
        client.beginExecution(invocationId,b.expertId());
        try{
            var result=client.callMapped(invocationId,selected,Map.of(b.audioArgument(),Base64.getEncoder().encodeToString(audio),b.mimeArgument(),mimeType),live);
            requireSuccess(result);
            String text;
            if(b.resultFormat().equals("TEXT"))text=singleText(result);
            else text=string(payload(result),b.textField(),16000);
            if(text.isBlank()||text.length()>16000)throw invalid();
            return text;
        }finally{client.endExecution(invocationId);}
    }
    public Audio synthesize(String serverId,UUID invocationId,String text,BooleanSupplier live){
        if(text==null||text.isBlank()||text.length()>MAX_TEXT_CHARS)throw invalid();
        var selected=select(serverId,McpOperationBinding.Operation.TTS,live);
        var b=(McpOperationBinding.Speech)selected.binding();
        client.beginExecution(invocationId,b.expertId());
        byte[] bytes=null;
        try{
            var result=client.callMapped(invocationId,selected,Map.of(b.textArgument(),text),live);
            requireSuccess(result);
            String encoded,mime;
            if(b.resultFormat().equals("AUDIO")){
                if(!(result.get("content") instanceof List<?> content)||content.size()!=1
                        ||!(content.getFirst() instanceof Map<?,?> part)||!"audio".equals(part.get("type")))throw invalid();
                encoded=string(part,"data",MAX_BASE64_CHARS);mime=string(part,"mimeType",80);
            }else{var payload=payload(result);encoded=string(payload,b.audioField(),MAX_BASE64_CHARS);mime=string(payload,b.mimeField(),80);}
            if((encoded.length()&3)!=0)throw invalid();
            try{bytes=Base64.getDecoder().decode(encoded);}catch(IllegalArgumentException malformed){throw invalid();}
            if(bytes.length==0||bytes.length>MAX_AUDIO_BYTES||!Base64.getEncoder().encodeToString(bytes).equals(encoded))throw invalid();
            requireAudio(bytes,mime);
            if(!live.getAsBoolean())throw invalid();
            var output=new Audio(bytes,mime);bytes=null;return output;
        }finally{if(bytes!=null)Arrays.fill(bytes,(byte)0);client.endExecution(invocationId);}
    }
    public void cancel(UUID invocationId){client.endExecution(invocationId);}
    private McpClientService.Mapped select(String serverId,McpOperationBinding.Operation operation,BooleanSupplier live){
        var selected=client.mapped(serverId,operation);
        if(!Set.of("http","stdio").contains(selected.transport()) || !client.mappedAuthorized(selected,live))throw new ResponseStatusException(HttpStatus.FORBIDDEN,McpErrors.MCP_TOOL_NOT_AUTHORIZED.code());
        return selected;
    }
    private Map<?,?> payload(Map<String,Object> result){
        if(result.get("structuredContent") instanceof Map<?,?> p)return p;
        try{return json.readValue(singleText(result),Map.class);}catch(RuntimeException malformed){throw invalid();}
    }
    private static String singleText(Map<String,Object> result){
        if(!(result.get("content") instanceof List<?>content)||content.size()!=1||!(content.getFirst() instanceof Map<?,?>part)
                ||!"text".equals(part.get("type")))throw invalid();
        return string(part,"text",6*1024*1024);
    }
    private static String string(Map<?,?>map,String key,int max){
        if(!(map.get(key) instanceof String s)||s.isBlank()||s.length()>max)throw invalid();return s;
    }
    private static void requireSuccess(Map<String,Object>result){if(Boolean.TRUE.equals(result.get("isError")))throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,McpErrors.MCP_TOOL_FAILED.code());}
    /** Verify supported container signatures rather than trusting MIME provided by a caller/server. */
    static void requireAudio(byte[] data,String mime){
        boolean valid=switch(Objects.toString(mime,"")){
            case "audio/wav" -> data.length>=12 && ascii(data,0,"RIFF")&&ascii(data,8,"WAVE");
            case "audio/mpeg" -> data.length>=3 && (ascii(data,0,"ID3")||((data[0]&255)==255&&(data[1]&224)==224));
            case "audio/ogg" -> data.length>=4&&ascii(data,0,"OggS");
            case "audio/webm" -> data.length>=4&&(data[0]&255)==0x1a&&(data[1]&255)==0x45&&(data[2]&255)==0xdf&&(data[3]&255)==0xa3;
            default -> false;
        };
        if(!valid)throw invalid();
    }
    private static boolean ascii(byte[]data,int offset,String text){for(int i=0;i<text.length();i++)if(data[offset+i]!=(byte)text.charAt(i))return false;return true;}
    private static ResponseStatusException invalid(){return new ResponseStatusException(HttpStatus.BAD_REQUEST,McpErrors.MCP_SERVER_INPUT_INVALID.code());}
}
