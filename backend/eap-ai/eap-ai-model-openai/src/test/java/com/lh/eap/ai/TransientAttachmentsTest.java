package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

class TransientAttachmentsTest {
    static final byte[] PNG = Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=");
    static Map<String,Object> image(byte[] bytes) throws Exception {
        return new HashMap<>(Map.of("id","local-1","name","tiny.png","mime","image/png","size",bytes.length,
                "sha256",HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)),"base64",Base64.getEncoder().encodeToString(bytes)));
    }
    @org.junit.jupiter.api.io.TempDir java.nio.file.Path root;
    @Test void imageCapabilityRequiresExplicitModelConfigurationAndPersists() {
        var connections=new ModelConnections(root.resolve("connections.json"),true,org.mockito.Mockito.mock(ModelClientSource.class));
        var created=connections.create("fake","http://127.0.0.1:18000/v1","test-key",true,true);
        connections.configureModels(created.id(),List.of(new ModelOption("vision-named-model",List.of())),List.of("vision-named-model"),"vision-named-model");
        assertFalse(connections.supportsImageInput(created.id(),"vision-named-model"));
        connections.configureModels(created.id(),List.of(new ModelOption("vision-named-model",List.of(),true)),List.of("vision-named-model"),"vision-named-model");
        assertTrue(connections.supportsImageInput(created.id(),"vision-named-model"));
        assertFalse(connections.supportsImageInput(created.id(),"other-model"));
        var reloaded=new ModelConnections(root.resolve("connections.json"),true,org.mockito.Mockito.mock(ModelClientSource.class));
        assertTrue(reloaded.list().items().getFirst().models().getFirst().supportsImageInput());
    }
    @Test void boundsHashMagicBase64AndCapabilityFailClosed() throws Exception {
        var valid = image(PNG);
        try(var holder = TransientAttachments.parse(List.of(valid))) {
            assertEquals("local-1",holder.refs().getFirst().id());
            assertThrows(ResponseStatusException.class, () -> holder.userMessage("look",false));
            assertFalse(holder.toString().contains((String)valid.get("base64")));
        }
        for (var entry : List.of(Map.entry("base64", "!".repeat(((PNG.length+2)/3)*4)), Map.entry("sha256","a".repeat(64)),
                Map.entry("mime","image/jpeg"), Map.entry("size",TransientAttachments.MAX_FILE_BYTES+1))) {
            var invalid = new HashMap<>(valid); invalid.put(entry.getKey(),entry.getValue());
            assertThrows(ResponseStatusException.class, () -> TransientAttachments.parse(List.of(invalid)));
        }
        assertThrows(ResponseStatusException.class, () -> TransientAttachments.parse(Collections.nCopies(7,valid)));
        var huge = PNG.clone(); huge[16]=1;
        var crc = new java.util.zip.CRC32(); crc.update(huge,12,17);
        java.nio.ByteBuffer.wrap(huge,29,4).putInt((int)crc.getValue());
        assertThrows(ResponseStatusException.class, () -> TransientAttachments.parse(List.of(image(huge))));
        var corrupt = PNG.clone(); corrupt[45] ^= 1;
        assertThrows(ResponseStatusException.class, () -> TransientAttachments.parse(List.of(image(corrupt))));
        var invalidMagic=PNG.clone(); invalidMagic[0]=0;
        assertThrows(ResponseStatusException.class, () -> TransientAttachments.parse(List.of(image(invalidMagic))));
    }
    @Test void closeWipesTheActualMediaAndSerializationContainsNoOriginals() throws Exception {
        var holder = TransientAttachments.parse(List.of(image(PNG)));
        var message = holder.userMessage("look",true);
        var data=message.getMedia().getFirst().getDataAsByteArray();
        assertArrayEquals(PNG,data);
        String json=JsonMapper.builder().build().writeValueAsString(holder);
        assertFalse(json.contains(Base64.getEncoder().encodeToString(PNG)));
        assertFalse(json.contains("base64"));
        holder.close(); assertArrayEquals(new byte[PNG.length],data);
        assertThrows(IllegalStateException.class, () -> holder.userMessage("look",true));
    }
    @Test void bothActualSdkRequestPathsSendTypedImages() throws Exception {
        for(String protocol:List.of("chat-completions","responses")) {
            var body=new AtomicReference<String>(); var path=new AtomicReference<String>();
            var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/",exchange->{
                path.set(exchange.getRequestURI().getPath()); body.set(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));
                String response=protocol.equals("responses")
                    ? "data: {\"type\":\"response.output_text.delta\",\"delta\":\"ok\",\"item_id\":\"msg_1\",\"output_index\":0,\"content_index\":0,\"sequence_number\":1}\n\ndata: {\"type\":\"response.completed\",\"sequence_number\":2,\"response\":{\"id\":\"resp_1\",\"object\":\"response\",\"created_at\":1,\"status\":\"completed\",\"model\":\"fake\",\"output\":[]}}\n\n"
                    : "{\"id\":\"chat_1\",\"object\":\"chat.completion\",\"created\":1,\"model\":\"fake\",\"choices\":[{\"index\":0,\"message\":{\"role\":\"assistant\",\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}";
                byte[] bytes=response.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type",protocol.equals("responses")?"text/event-stream":"application/json");
                exchange.sendResponseHeaders(200,bytes.length); try(var out=exchange.getResponseBody()){out.write(bytes);}
            }); server.start();
            try(var holder=TransientAttachments.parse(List.of(image(PNG)))) {
                var snapshot=new ModelConnectionSnapshot(UUID.randomUUID(),"fake",ModelConnections.KIND,true,"http://127.0.0.1:"+server.getAddress().getPort()+"/v1","fake","test",1,true,"test",protocol);
                var memory=MessageWindowChatMemory.builder().build();
                var client=new SpringAiModelClientSource(memory).transientConversation(snapshot);
                assertEquals("ok",client.prompt().messages(holder.userMessage("what?",true))
                        .advisors(a -> a.param(org.springframework.ai.chat.memory.ChatMemory.CONVERSATION_ID,"transient-test")).call().content());
                assertTrue(memory.get("transient-test").isEmpty(),"Shared chat memory must never receive original image bytes");
                var json=JsonMapper.builder().build().readTree(body.get());
                var parts=protocol.equals("responses")?json.path("input").get(0).path("content"):json.path("messages").get(0).path("content");
                assertEquals(protocol.equals("responses")?"input_image":"image_url",parts.get(1).path("type").asText());
                String url=protocol.equals("responses")?parts.get(1).path("image_url").asText():parts.get(1).path("image_url").path("url").asText();
                assertEquals("data:image/png;base64,"+Base64.getEncoder().encodeToString(PNG),url);
                assertEquals(protocol.equals("responses")?"/v1/responses":"/v1/chat/completions",path.get());
            } finally {server.stop(0);}
        }
    }
}
