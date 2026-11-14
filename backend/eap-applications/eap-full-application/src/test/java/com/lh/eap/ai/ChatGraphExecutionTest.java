package com.lh.eap.ai;
import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.MessageWindowChatMemory;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;

class ChatGraphExecutionTest {
    @TempDir Path root;
    @Test void editedRootAndRegenerationUseOnlySelectedHistoryAndRetryNeverCallsModelTwice() throws Exception {
        var seen=new ArrayList<String>();
        var model=FakeChatModels.scripted(prompt->{
            seen.add(prompt.getInstructions().stream().map(m->String.valueOf(m.getText())).collect(java.util.stream.Collectors.joining("\n")));
            return FakeChatModels.text("answer-"+seen.size());
        });
        var memory=MessageWindowChatMemory.builder().maxMessages(30).build();
        var registry=new AiConversationRegistry(memory);
        var handlers=new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of());
        var client=EngineeringAiConfiguration.createClient(ChatClient.builder(model),memory);
        var service=new EngineeringChatService(client,handlers,root,new com.lh.eap.application.service.FileExecutionArtifactStore(root.resolve("artifacts")));
        var app=new AiChatApplication(new AiConnectionStatus(handlers,root,root,"local","m","none",true),registry,service,root);
        var fixture=new ChatGraphPersistenceTest();fixture.setup();
        ReflectionTestUtils.setField(app,"graphs",fixture.store);
        var id=app.open("{}").conversationId();
        var events=new ArrayList<com.lh.eap.ai.dto.ChatExecutionEvent>();
        var first=request(0,"send",null,null,"ORIGINAL_ROOT");
        var firstResponse=app.send(id,first,events::add);
        assertEquals("accepted",events.getFirst().type());
        var graph=app.graph(id);var firstOp=graph.operations().getFirst();
        app.send(id,request(1,"send",firstOp.assistantMessageId(),null,"ORIGINAL_DEEP"));
        assertTrue(seen.get(1).contains("ORIGINAL_ROOT"));
        app.send(id,request(2,"edit",null,firstOp.userMessageId(),"EDITED_ROOT"));
        assertFalse(seen.get(2).contains("ORIGINAL_ROOT"));assertFalse(seen.get(2).contains("ORIGINAL_DEEP"));
        app.send(id,request(3,"regenerate",firstOp.userMessageId(),firstOp.assistantMessageId(),""));
        assertTrue(seen.get(3).contains("ORIGINAL_ROOT"));assertFalse(seen.get(3).contains("ORIGINAL_DEEP"));assertFalse(seen.get(3).contains("EDITED_ROOT"));
        assertEquals(firstResponse,app.send(id,first));assertEquals(4,seen.size());
        var journal=(ChatExecutionJournal)ReflectionTestUtils.getField(app,"journal");
        ((Map<?,?>)ReflectionTestUtils.getField(journal,"logs")).clear();
        var replay=new ArrayList<com.lh.eap.ai.dto.ChatExecutionEvent>();
        assertEquals(firstResponse,app.send(id,first,replay::add));
        assertEquals(List.of("accepted","final"),replay.stream().map(com.lh.eap.ai.dto.ChatExecutionEvent::type).toList());
        assertEquals(events.getLast().sequence(),replay.getLast().sequence());assertEquals(4,seen.size());
        var restarted=new AiChatApplication(new AiConnectionStatus(handlers,root,root,"local","m","none",true),new AiConversationRegistry(memory),service,root);
        ReflectionTestUtils.setField(restarted,"graphs",new ChatGraphStore(fixture.jdbc,new org.springframework.jdbc.datasource.DataSourceTransactionManager(fixture.jdbc.getDataSource())));
        var restartedEvents=new ArrayList<com.lh.eap.ai.dto.ChatExecutionEvent>();
        assertEquals(firstResponse,restarted.send(id,first,restartedEvents::add));assertEquals(2,restartedEvents.size());assertEquals(4,seen.size());
        assertEquals(firstOp.executionId(),app.operation(id,firstOp.operationId()).get("executionId"));
        assertEquals(firstResponse,app.graph(id).nodes().stream().filter(n->n.id().equals(firstOp.assistantMessageId())).findFirst().orElseThrow().response());
        app.clearModelHistory(id);
        app.send(id,request(4,"send",firstOp.assistantMessageId(),null,"AFTER_CLEAR"));
        assertFalse(seen.get(4).contains("ORIGINAL_ROOT"));assertFalse(seen.get(4).contains("answer-1"));
        var conflict=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->app.send(id,first.replace("ORIGINAL_ROOT","CHANGED_ROOT")));
        assertEquals("CHAT_OPERATION_CONFLICT",conflict.getReason());assertEquals(5,seen.size());
        var fileRequest=request(5,"send",app.graph(id).operations().getLast().assistantMessageId(),null,"TEXT_FILE")
            .replace("\"toolMode\":\"none\"","\"toolMode\":\"none\",\"context\":{\"files\":[{\"name\":\"note.txt\",\"content\":\"FILE_ORIGINAL_MUST_NOT_PERSIST\"}]}");
        app.send(id,fileRequest);
        assertTrue(seen.get(5).contains("FILE_ORIGINAL_MUST_NOT_PERSIST"));
        assertFalse(fixture.jdbc.queryForList("SELECT snapshot FROM eap.chat_graph",String.class).stream().anyMatch(value->value.contains("FILE_ORIGINAL_MUST_NOT_PERSIST")));
        var clearing=new java.util.concurrent.CountDownLatch(1);var release=new java.util.concurrent.CountDownLatch(1);
        var storeSpy=org.mockito.Mockito.spy(fixture.store);ReflectionTestUtils.setField(app,"graphs",storeSpy);
        org.mockito.Mockito.doAnswer(invocation->{clearing.countDown();assertTrue(release.await(5,java.util.concurrent.TimeUnit.SECONDS));return invocation.callRealMethod();})
            .when(storeSpy).boundary(org.mockito.ArgumentMatchers.any());
        try(var threads=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
            var clear=threads.submit(()->app.clearModelHistory(id));assertTrue(clearing.await(5,java.util.concurrent.TimeUnit.SECONDS));
            var send=threads.submit(()->app.send(id,request(6,"send",firstOp.assistantMessageId(),null,"AFTER_ATOMIC_CLEAR")));
            try {assertThrows(java.util.concurrent.TimeoutException.class,()->send.get(100,java.util.concurrent.TimeUnit.MILLISECONDS));}
            finally {release.countDown();}
            clear.get(5,java.util.concurrent.TimeUnit.SECONDS);send.get(5,java.util.concurrent.TimeUnit.SECONDS);
            assertFalse(seen.getLast().contains("ORIGINAL_ROOT"));assertFalse(seen.getLast().contains("FILE_ORIGINAL_MUST_NOT_PERSIST"));
        } finally {release.countDown();}
    }
    @Test void imageOnlyUsesBoundedProviderWindowAndDoesNotPersistOriginals() throws Exception {
        var prompts=new ArrayList<org.springframework.ai.chat.prompt.Prompt>();
        var model=FakeChatModels.scripted(prompt->{prompts.add(prompt);return FakeChatModels.text("image observed");});
        var memory=MessageWindowChatMemory.builder().maxMessages(4).build();
        var handlers=new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of());
        var source=new ModelClientSource() {
            public ChatClient conversational(ModelConnectionSnapshot snapshot){return EngineeringAiConfiguration.createClient(ChatClient.builder(model),memory);}
            public ChatClient completion(ModelConnectionSnapshot snapshot){return ChatClient.builder(model).build();}
            public ChatClient transientConversation(ModelConnectionSnapshot snapshot){return ChatClient.builder(model).build();}
        };
        var connections=new ModelConnections(root.resolve("connections.json"),false,source);
        var saved=connections.create("images","https://127.0.0.1:9/v1","local-secret",true,true);
        connections.configureModels(saved.id(),List.of(new ModelOption("image-model",List.of(),true)),List.of("image-model"),"image-model");
        var registry=new AiConversationRegistry(memory);
        var service=new EngineeringChatService(null,handlers,root,new com.lh.eap.application.service.FileExecutionArtifactStore(root.resolve("artifacts")));
        var app=new AiChatApplication(new AiConnectionStatus(handlers,root,root,"local","m","none",true),registry,service,root,connections);
        var fixture=new ChatGraphPersistenceTest();fixture.setup();ReflectionTestUtils.setField(app,"graphs",fixture.store);
        var id=app.open("{}").conversationId();
        var owner=new ChatGraphStore.Owner(AiConversationRegistry.PRINCIPAL,root.toAbsolutePath().normalize().toString(),id);
        UUID parent=null;
        for(int i=0;i<7;i++) {
            var operation=UUID.randomUUID();var r=fixture.store.reserve(owner,operation,operation.toString(),i,"send",parent,null,i==0?"OLD_SECRET_"+"x".repeat(30000):"recent-"+i,false);
            fixture.store.finish(owner,r,new com.lh.eap.ai.dto.AiMessageResponse(r.operation().executionId(),"answer-"+i,"","SUCCEEDED","","",List.of(),"",List.of()));parent=r.operation().assistantMessageId();
        }
        var png=new java.io.ByteArrayOutputStream();
        assertTrue(javax.imageio.ImageIO.write(new java.awt.image.BufferedImage(1,1,java.awt.image.BufferedImage.TYPE_INT_RGB),"png",png));
        byte[] bytes=png.toByteArray();
        var hash=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes));
        var ref=Map.of("id","local-image","name","pixel.png","mime","image/png","size",bytes.length,"sha256",hash);
        var transport=new LinkedHashMap<String,Object>(ref);transport.put("base64",Base64.getEncoder().encodeToString(bytes));
        var mapper=JsonMapper.builder().build();var body=mapper.readValue(request(7,"send",parent,null,""),Map.class);
        body.put("context",Map.of("attachmentRefs",List.of(ref)));body.put("transientAttachments",List.of(transport));
        var response=app.send(id,mapper.writeValueAsString(body));assertEquals("SUCCEEDED",response.status());assertEquals(1,prompts.size());
        assertFalse(prompts.getFirst().getInstructions().stream().anyMatch(m->m.getText().contains("OLD_SECRET_")));
        assertEquals(1,prompts.getFirst().getInstructions().stream().filter(m->m instanceof org.springframework.ai.chat.messages.UserMessage u&&!u.getMedia().isEmpty()).count());
        assertTrue(prompts.getFirst().getInstructions().size()<=6);
        var durable=fixture.jdbc.queryForList("SELECT snapshot FROM eap.chat_graph",String.class).toString();
        assertFalse(durable.contains(Base64.getEncoder().encodeToString(bytes)));assertTrue(durable.contains(hash));
    }
    static String request(long revision,String kind,UUID parent,UUID target,String text) {
        var body=new LinkedHashMap<String,Object>();body.put("operationId",UUID.randomUUID());body.put("expectedRevision",revision);body.put("kind",kind);
        body.put("parentMessageId",parent);body.put("targetMessageId",target);body.put("message",text);body.put("toolMode","none");
        return JsonMapper.builder().build().writeValueAsString(body);
    }
}
