package com.lh.eap.ai;

import com.lh.eap.runtime.mcp.client.McpSpeechService;
import jakarta.annotation.PreDestroy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Bounded process-local speech observations. No chat/model/plan execution and no durable audio. */
@Component
public final class AiSpeechApplication {
    public static final int MAX_WIRE_BYTES=6*1024*1024, MAX_AUDIO_BYTES=4*1024*1024, MAX_TEXT_CHARS=4000;
    private static final int MAX_OPERATIONS=64, MAX_RUNNING=2, MAX_CACHED_AUDIO=16*1024*1024;
    private static final Duration TTL=Duration.ofMinutes(10);
    private final McpSpeechService speech;
    private final Supplier<Instant> clock;
    private final String owner;
    private final Object lock=new Object();
    private final LinkedHashMap<UUID,Entry> entries=new LinkedHashMap<>();
    private int cachedBytes;
    private boolean closed;
    private final java.util.concurrent.ScheduledExecutorService expiry=java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r->{var thread=new Thread(r,"speech-observation-expiry");thread.setDaemon(true);return thread;});
    public record AudioResult(String mime,String base64) {}
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    public record Result(String text,AudioResult audio) {}
    public record Operation(UUID operationId,String kind,String status,Result result,String errorCode,Instant expiresAt) {}
    private static final class Entry {
        final UUID id,invocation=UUID.randomUUID(); final String kind,fingerprint; final Instant expires;
        SpeechOperationStatus status=SpeechOperationStatus.RUNNING; boolean cancelled;
        String text,mime,error;byte[] audio;
        Entry(UUID id,String kind,String fingerprint,Instant expires){this.id=id;this.kind=kind;this.fingerprint=fingerprint;this.expires=expires;}
    }
    @org.springframework.beans.factory.annotation.Autowired
    public AiSpeechApplication(McpSpeechService speech,Path workspace){this(speech,workspace,Instant::now);}
    AiSpeechApplication(McpSpeechService speech,Path workspace,Supplier<Instant> clock){
        this.speech=speech;this.clock=clock;
        owner=AiConversationRegistry.PRINCIPAL+":"+workspace.toAbsolutePath().normalize();
        expiry.scheduleAtFixedRate(this::expire,1,1,java.util.concurrent.TimeUnit.SECONDS);
    }
    public List<McpSpeechService.AvailableService> services(){return speech.availableServices();}
    public Operation transcribe(String json){
        var body=body(json,Set.of("operationId","serverId","audio"));
        if(!(body.get("audio") instanceof Map<?,?> audio)||!audio.keySet().equals(Set.of("mime","base64"))
            ||!(audio.get("mime") instanceof String mime)||mime.isBlank()||mime.length()>100
            ||!(audio.get("base64") instanceof String encoded)||encoded.length()>((MAX_AUDIO_BYTES+2)/3)*4)throw invalid();
        byte[] decoded;
        try{decoded=Base64.getDecoder().decode(encoded);}catch(IllegalArgumentException malformed){throw invalid();}
        try{
            if(decoded.length==0||decoded.length>MAX_AUDIO_BYTES||!Base64.getEncoder().encodeToString(decoded).equals(encoded))throw invalid();
            String server=server(body);UUID id=id(body);
            var start=reserve(id,"transcription",digest(owner,"transcription",server,mime,digest(decoded)));
            if(!start.fresh())return view(start.entry());
            var entry=start.entry();
            try{
                String text=speech.transcribe(server,entry.invocation,decoded,mime,()->allowed(entry));
                if(text==null||text.length()>McpSpeechService.MAX_TRANSCRIPT_CHARS)throw invalid();
                synchronized(lock){if(allowed(entry)){entry.text=text;entry.status=SpeechOperationStatus.SUCCEEDED;}else cancelTerminal(entry);}
            }catch(RuntimeException failure){fail(entry,failure);}
            return view(entry);
        }finally{Arrays.fill(decoded,(byte)0);}
    }
    public Operation synthesize(String json){
        var body=body(json,Set.of("operationId","serverId","text"));
        if(!(body.get("text") instanceof String text)||text.isBlank()||text.length()>MAX_TEXT_CHARS)throw invalid();
        String server=server(body);var start=reserve(id(body),"synthesis",digest(owner,"synthesis",server,text));
        if(!start.fresh())return view(start.entry());
        var entry=start.entry();
        try(var audio=speech.synthesize(server,entry.invocation,text,()->allowed(entry))){
            if(audio==null||audio.bytes()==null||audio.bytes().length==0||audio.bytes().length>MAX_AUDIO_BYTES)throw invalid();
            synchronized(lock){
                if(allowed(entry)){
                    makeRoom(audio.bytes().length,entry.id);
                    entry.audio=audio.bytes().clone();cachedBytes+=entry.audio.length;entry.mime=audio.mimeType();entry.status=SpeechOperationStatus.SUCCEEDED;
                }else cancelTerminal(entry);
            }
        }catch(RuntimeException failure){fail(entry,failure);}
        return view(entry);
    }
    public Operation operation(UUID id){synchronized(lock){sweep();var entry=entries.get(id);if(entry==null)throw error(HttpStatus.NOT_FOUND,SpeechErrors.SPEECH_OPERATION_NOT_FOUND);return view(entry);}}
    public Map<String,Object> cancel(UUID id){
        final Entry entry;
        synchronized(lock){sweep();entry=entries.get(id);if(entry==null)throw error(HttpStatus.NOT_FOUND,SpeechErrors.SPEECH_OPERATION_NOT_FOUND);
            if(entry.status!=SpeechOperationStatus.RUNNING)return Map.of("operationId",id,"cancelRequested",false);entry.cancelled=true;}
        speech.cancel(entry.invocation);
        return Map.of("operationId",id,"cancelRequested",true);
    }
    private record Start(Entry entry,boolean fresh) {}
    private Start reserve(UUID id,String kind,String fingerprint){synchronized(lock){
        sweep();var previous=entries.get(id);
        if(previous!=null){if(!previous.fingerprint.equals(fingerprint))throw error(HttpStatus.CONFLICT,SpeechErrors.SPEECH_OPERATION_CONFLICT);return new Start(previous,false);}
        if(closed)throw error(HttpStatus.SERVICE_UNAVAILABLE,SpeechErrors.SPEECH_SERVICE_UNAVAILABLE);
        if(entries.values().stream().filter(e->e.status==SpeechOperationStatus.RUNNING).count()>=MAX_RUNNING)throw error(HttpStatus.TOO_MANY_REQUESTS,SpeechErrors.SPEECH_CAPACITY_EXCEEDED);
        while(entries.size()>=MAX_OPERATIONS)if(!evict(null))throw error(HttpStatus.TOO_MANY_REQUESTS,SpeechErrors.SPEECH_CAPACITY_EXCEEDED);
        var entry=new Entry(id,kind,fingerprint,clock.get().plus(TTL));entries.put(id,entry);return new Start(entry,true);
    }}
    private boolean allowed(Entry e){synchronized(lock){return !closed&&!e.cancelled&&clock.get().isBefore(e.expires)&&e.status==SpeechOperationStatus.RUNNING;}}
    private void fail(Entry e,RuntimeException failure){synchronized(lock){
        if(e.cancelled||closed||!clock.get().isBefore(e.expires)){cancelTerminal(e);return;}
        e.status=SpeechOperationStatus.FAILED;
        String code=failure instanceof ResponseStatusException r?r.getReason():null;
        e.error=code!=null&&code.matches("[A-Z][A-Z0-9_]{1,119}")?code:SpeechErrors.SPEECH_OPERATION_FAILED.code();
    }}
    private void cancelTerminal(Entry e){e.status=SpeechOperationStatus.CANCELLED;e.error=SpeechErrors.SPEECH_CANCELLED.code();}
    private Operation view(Entry e){synchronized(lock){
        Result result=e.status==SpeechOperationStatus.SUCCEEDED?new Result(e.text,e.audio==null?null:new AudioResult(e.mime,Base64.getEncoder().encodeToString(e.audio))):null;
        return new Operation(e.id,e.kind,e.status.wire(),result,e.error,e.expires);
    }}
    private void expire(){
        List<Entry> expired;
        synchronized(lock){sweep();expired=entries.values().stream().filter(e->e.status==SpeechOperationStatus.RUNNING&&!e.cancelled&&!clock.get().isBefore(e.expires)).toList();expired.forEach(e->e.cancelled=true);}
        for(var entry:expired)try{speech.cancel(entry.invocation);}catch(RuntimeException ignored){/* Live gate still rejects late results. */}
    }
    private void sweep(){var iterator=entries.values().iterator();while(iterator.hasNext()){var e=iterator.next();if(e.status!=SpeechOperationStatus.RUNNING&&!clock.get().isBefore(e.expires)){wipe(e);iterator.remove();}}}
    private boolean evict(UUID except){var iterator=entries.values().iterator();while(iterator.hasNext()){var e=iterator.next();if(e.status!=SpeechOperationStatus.RUNNING&&!e.id.equals(except)){wipe(e);iterator.remove();return true;}}return false;}
    private void makeRoom(int bytes,UUID except){while(cachedBytes+bytes>MAX_CACHED_AUDIO)if(!evict(except))throw error(HttpStatus.TOO_MANY_REQUESTS,SpeechErrors.SPEECH_CAPACITY_EXCEEDED);}
    private void wipe(Entry e){if(e.audio!=null){cachedBytes-=e.audio.length;Arrays.fill(e.audio,(byte)0);e.audio=null;}e.text=null;}
    @PreDestroy public void close(){expiry.shutdownNow();List<Entry> running;synchronized(lock){closed=true;running=entries.values().stream().filter(e->e.status==SpeechOperationStatus.RUNNING).toList();for(var e:running)e.cancelled=true;entries.values().forEach(this::wipe);entries.clear();}for(var e:running)speech.cancel(e.invocation);}
    private static Map<String,Object> body(String json,Set<String> keys){if(json!=null&&json.getBytes(StandardCharsets.UTF_8).length>MAX_WIRE_BYTES)throw error(HttpStatus.CONTENT_TOO_LARGE,SpeechErrors.SPEECH_PAYLOAD_TOO_LARGE);var body=AiChatApplication.objectBody(json,keys);if(!body.keySet().equals(keys))throw invalid();return body;}
    private static UUID id(Map<String,Object> body){try{return UUID.fromString((String)body.get("operationId"));}catch(RuntimeException invalid){throw invalid();}}
    private static String server(Map<String,Object> body){if(!(body.get("serverId") instanceof String server)||!server.matches("[a-z0-9][a-z0-9_-]{0,60}"))throw invalid();return server;}
    private static String digest(String... values){return digest(tools.jackson.databind.json.JsonMapper.builder().build().writeValueAsBytes(values));}
    private static String digest(byte[] bytes){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}catch(java.security.NoSuchAlgorithmException impossible){throw new IllegalStateException(impossible);}}
    private static ResponseStatusException invalid(){return error(HttpStatus.BAD_REQUEST,SpeechErrors.INVALID_SPEECH_REQUEST);}
    private static ResponseStatusException error(HttpStatus status,SpeechErrors code){return new ResponseStatusException(status,code.code());}
}
