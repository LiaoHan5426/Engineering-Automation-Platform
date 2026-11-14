package com.lh.eap.ai;
import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.*;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.server.ResponseStatusException;
class ChatPlanPersistenceTest {
    JdbcTemplate jdbc;
    ChatPlanService service;
    ChatPlanStore.Owner owner;
    @BeforeEach void setup() {
        var ds = new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        new JdbcTemplate(ds).execute("CREATE SCHEMA eap");
        new ResourceDatabasePopulator(new ClassPathResource("db/migration/V2__chat_task_plan.sql")).execute(ds);
        jdbc = new JdbcTemplate(ds);
        service = new ChatPlanService(new JdbcChatPlanStore(jdbc,new DataSourceTransactionManager(ds)));
        owner = new ChatPlanStore.Owner("operator","/workspace",UUID.randomUUID(),UUID.randomUUID());
        service.open(owner);
    }
    ChatPlanService.Command command(long revision, ChatPlanService.InputItem... items) {
        return new ChatPlanService.Command(revision,UUID.randomUUID(),List.of(items));
    }
    ChatPlanService.InputItem item(UUID id,String text,String status) { return new ChatPlanService.InputItem(id,text,status); }
    void code(String expected, Runnable action) { assertEquals(expected,assertThrows(ResponseStatusException.class,action::run).getReason()); }
    @Test void createsReordersClearsAndReadsAfterServiceRestart() {
        assertNull(service.read(owner));
        var first = service.update(owner,command(0,item(null,"Inspect","pending"),item(null,"Verify","in_progress")),()->false);
        assertEquals(1,first.revision()); assertEquals(1,first.schemaVersion());
        var second = service.update(owner,command(1,item(first.items().get(1).id(),"Verify","completed"),item(first.items().get(0).id(),"Inspect","in_progress")),()->false);
        assertEquals(first.planId(),second.planId());
        assertEquals(first.items().get(1).id(),second.items().getFirst().id());
        var restarted = new ChatPlanService(new JdbcChatPlanStore(jdbc,new DataSourceTransactionManager(jdbc.getDataSource())));
        assertEquals(second,restarted.read(owner));
        var cleared = restarted.update(owner,command(2),()->false);
        assertTrue(cleared.items().isEmpty()); assertEquals(3,cleared.revision());
    }
    @Test void deduplicatesAndRejectsOperationReuseAndStaleRevision() {
        var command=command(0,item(null,"Inspect","pending"));
        var first=service.update(owner,command,()->false);
        assertEquals(first,service.update(owner,command,()->false));
        code("CHAT_PLAN_OPERATION_CONFLICT",()->service.update(owner,new ChatPlanService.Command(0,command.operationId(),List.of()),()->false));
        code("CHAT_PLAN_REVISION_CONFLICT",()->service.update(owner,command(0),()->false));
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM eap.chat_plan_operation",Integer.class));
    }
    @Test void authorizesPersistedOwnerWithoutRegistryAndIsolatesExecutions() {
        for (var foreign : List.of(new ChatPlanStore.Owner("other",owner.workspace(),owner.conversationId(),owner.executionId()),
                new ChatPlanStore.Owner(owner.principal(),"/other",owner.conversationId(),owner.executionId()),
                new ChatPlanStore.Owner(owner.principal(),owner.workspace(),UUID.randomUUID(),owner.executionId()))) {
            code("UNKNOWN_EXECUTION",()->service.read(foreign));
            code("UNKNOWN_EXECUTION",()->service.update(foreign,command(0),()->false));
        }
        var next=new ChatPlanStore.Owner(owner.principal(),owner.workspace(),owner.conversationId(),UUID.randomUUID());
        service.open(next); assertNull(service.read(next));
    }
    @Test void cancellationAndTerminalRetainLastCommittedSnapshot() {
        var first=service.update(owner,command(0,item(null,"Unverified","pending")),()->false);
        code("CHAT_PLAN_EXECUTION_CLOSED",()->service.update(owner,command(1),()->true));
        service.close(owner);
        code("CHAT_PLAN_EXECUTION_CLOSED",()->service.update(owner,command(1),()->false));
        assertEquals(first,service.read(owner));
    }
    @Test void validatesUnicodeLimitsIdsStatesAndTransactionalRollback() {
        var unicode="😀".repeat(500);
        service.update(owner,command(0,item(null,unicode,"pending")),()->false);
        code("INVALID_CHAT_PLAN",()->service.update(owner,command(1,item(null,unicode+"x","pending")),()->false));
        code("INVALID_CHAT_PLAN",()->service.update(owner,command(1,item(null,"x","unknown")),()->false));
        code("INVALID_CHAT_PLAN",()->service.update(owner,command(1,item(UUID.randomUUID(),"x","pending")),()->false));
        var tooMany=new ChatPlanService.Command(1,UUID.randomUUID(),Collections.nCopies(33,item(null,"x","pending")));
        code("INVALID_CHAT_PLAN",()->service.update(owner,tooMany,()->false));
        var tooLarge=new ChatPlanService.Command(1,UUID.randomUUID(),Collections.nCopies(32,item(null,unicode,"pending")));
        code("INVALID_CHAT_PLAN",()->service.update(owner,tooLarge,()->false));
        assertEquals(1,service.read(owner).revision());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM eap.chat_plan_operation",Integer.class));
    }
    @Test void concurrentCasHasOneWinner() throws Exception {
        var start=new CountDownLatch(1);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var futures=new ArrayList<Future<Boolean>>();
            for(int i=0;i<2;i++) futures.add(pool.submit(()->{start.await();try {service.update(owner,command(0),()->false);return true;}
                catch(ResponseStatusException rejected){assertEquals("CHAT_PLAN_REVISION_CONFLICT",rejected.getReason());return false;}}));
            start.countDown(); int winners=0; for(var f:futures) if(f.get()) winners++;
            assertEquals(1,winners); assertEquals(1,service.read(owner).revision());
        }
    }
    @org.junit.jupiter.api.io.TempDir java.nio.file.Path root;
    @Test void realToolLoopAllowsFourSourceReadsAndTwoPlanUpdates() {
        var turns=new java.util.concurrent.atomic.AtomicInteger();
        var gitReads=new java.util.concurrent.atomic.AtomicInteger();
        var events=new ArrayList<com.lh.eap.ai.dto.ChatPlanSnapshot>();
        var tool=new ChatPlanTool(service,owner,()->false,events::add);
        var handler=new com.lh.eap.runtime.handler.CapabilityHandler() {
            public Set<String> capabilities(){return Set.of("git-status");}
            public com.lh.eap.domain.model.NodeResult handle(com.lh.eap.domain.model.CapabilityContext context){gitReads.incrementAndGet();return new com.lh.eap.domain.model.NodeResult(true,false,"ok",Map.of("stdout","clean"));}
        };
        var client=ChatClients.createClient(org.springframework.ai.chat.client.ChatClient.builder(FakeChatModels.scripted(prompt->{
            int turn=turns.getAndIncrement();
            if(turn>=6)return new org.springframework.ai.chat.model.ChatResponse(List.of(new org.springframework.ai.chat.model.Generation(new org.springframework.ai.chat.messages.AssistantMessage("done"))));
            boolean plan=turn==0 || turn==5;
            String args=plan ? "{\"expectedRevision\":"+(turn==0?0:1)+",\"operationId\":\""+UUID.randomUUID()+"\",\"items\":[]}" : "{\"paths\":[\"f"+turn+"\"]}";
            return new org.springframework.ai.chat.model.ChatResponse(List.of(new org.springframework.ai.chat.model.Generation(org.springframework.ai.chat.messages.AssistantMessage.builder().content("")
                .toolCalls(List.of(new org.springframework.ai.chat.messages.AssistantMessage.ToolCall("c"+turn,"function",plan?"update_execution_plan":"read_selected_sources",args))).build())));
        })),org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().build());
        var chat=new EngineeringChatService(client,new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of(handler)),root,
                new com.lh.eap.application.service.FileExecutionArtifactStore(root.resolve("artifacts")));
        var frozen=new com.lh.eap.delivery.CodeGenerationStore.Snapshot(UUID.randomUUID(),owner.principal(),owner.conversationId(),root.toString(),"f1","h","source1",null,null,java.time.Instant.now(),null,
                List.of(new com.lh.eap.delivery.ComponentGraph.Source("f2","h","source2"),new com.lh.eap.delivery.ComponentGraph.Source("f3","h","source3"),new com.lh.eap.delivery.ComponentGraph.Source("f4","h","source4")));
        var sources=new CodeSourceTool(frozen,()->{},()->false);
        var outcome=chat.chat(new EngineeringChatService.Request(owner.principal(),owner.conversationId(),root,true,"inspect"),true,null,TaskContext.EMPTY,
                owner.executionId(),()->false,null,sources,tool);
        assertEquals("",outcome.error()); assertEquals("done",outcome.answer());
        assertEquals(0,gitReads.get()); assertEquals(4,sources.events().size()); assertEquals("",sources.completionError()); assertEquals(2,events.size()); assertEquals(2,service.read(owner).revision());
    }
    @Test void toolTranscriptBudgetRejectsBeforeAnyCommit() {
        var tool=new ChatPlanTool(service,owner,()->false,snapshot->{});
        String item="{\"content\":\""+"x".repeat(500)+"\",\"status\":\"pending\"}";
        String items=String.join(",",Collections.nCopies(16,item));
        String input="{\"expectedRevision\":0,\"operationId\":\""+UUID.randomUUID()+"\",\"items\":["+items+"]}";
        assertThrows(org.springframework.ai.tool.execution.ToolExecutionException.class,()->tool.call(input));
        assertEquals("CONTEXT_BUDGET_EXCEEDED",tool.failure()); assertNull(service.read(owner));
    }
    @Test void planToolRejectsUnknownFieldsMalformedStatesAndThirdCall() {
        var tool=new ChatPlanTool(service,owner,()->false,snapshot->{});
        assertEquals("INVALID_CHAT_PLAN",tool.call("{\"expectedRevision\":0.5,\"operationId\":\""+UUID.randomUUID()+"\",\"items\":[]}"));
        assertEquals("INVALID_CHAT_PLAN",tool.call("{\"expectedRevision\":0,\"operationId\":\""+UUID.randomUUID()+"\",\"items\":[{\"content\":\"x\",\"status\":\"pending\",\"dependency\":true}]}"));
        assertThrows(org.springframework.ai.tool.execution.ToolExecutionException.class,()->tool.call("{}"));
        assertEquals("TOOL_CALL_LIMIT",tool.failure()); assertNull(service.read(owner));
    }

    @Test void httpReadsDirectJsonNullAndSnapshotWithNoInMemoryConversation() throws Exception {
        var durable=new ChatPlanStore.Owner(AiConversationRegistry.PRINCIPAL,root.toAbsolutePath().normalize().toString(),UUID.randomUUID(),UUID.randomUUID());
        service.open(durable);
        var app=new AiChatApplication(null,new AiConversationRegistry(org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().build()),null,root);
        org.springframework.test.util.ReflectionTestUtils.setField(app,"plans",service);
        var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(new com.lh.eap.web.controller.AiChatController(app,null)).build();
        String url="/api/ai/conversations/"+durable.conversationId()+"/executions/"+durable.executionId()+"/plan";
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk())
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.content().string("null"));
        var snapshot=service.update(durable,command(0,item(null,"Inspect","pending")),()->false);
        service.close(durable);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.schemaVersion").value(1))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.planId").value(snapshot.planId().toString()))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath("$.revision").value(1));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(url.replace(durable.conversationId().toString(),UUID.randomUUID().toString())))
            .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        app.shutdownTurns();
    }

    @Test void applicationPublishesPlanThenClosesWritesAndFailsClosedWithoutStore() throws Exception {
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        var registry=new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of(new com.lh.eap.runtime.handler.CapabilityHandler() {
            public Set<String> capabilities(){return Set.of("git-status");}
            public com.lh.eap.domain.model.NodeResult handle(com.lh.eap.domain.model.CapabilityContext c){throw new AssertionError("No git needed");}
        }));
        var status=new AiConnectionStatus(registry,root,root,"openai","offline","https://api.openai.com",true);
        var memory=org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().build();
        var model=FakeChatModels.scripted(prompt->{
            if(calls.getAndIncrement()==0) return new org.springframework.ai.chat.model.ChatResponse(List.of(new org.springframework.ai.chat.model.Generation(
                org.springframework.ai.chat.messages.AssistantMessage.builder().content("").toolCalls(List.of(new org.springframework.ai.chat.messages.AssistantMessage.ToolCall("plan","function","update_execution_plan",
                    "{\"expectedRevision\":0,\"operationId\":\""+UUID.randomUUID()+"\",\"items\":[{\"content\":\"Declared done\",\"status\":\"completed\"}]}"))).build())));
            return FakeChatModels.text("done");
        });
        var chat=new EngineeringChatService(ChatClients.createClient(org.springframework.ai.chat.client.ChatClient.builder(model),memory),registry,root,
                new com.lh.eap.application.service.FileExecutionArtifactStore(root.resolve("application-artifacts")));
        var app=new AiChatApplication(status,new AiConversationRegistry(memory),chat,root);
        org.springframework.test.util.ReflectionTestUtils.setField(app,"plans",service);
        try {
            var conversation=app.open("{}").conversationId();
            var events=new ArrayList<com.lh.eap.ai.dto.ChatExecutionEvent>();
            var response=app.send(conversation,"{\"message\":\"inspect\",\"toolMode\":\"git_status\"}",events::add);
            var event=events.stream().filter(e->e.type().equals("plan.updated")).findFirst().orElseThrow();
            assertEquals("",event.status());
            var plan=app.executionPlan(conversation,response.executionId());
            assertEquals(plan,event.payload()); assertEquals("completed",plan.items().getFirst().status());
            assertEquals("UNVERIFIED",response.verification());
            var actualOwner=new ChatPlanStore.Owner(AiConversationRegistry.PRINCIPAL,root.toAbsolutePath().normalize().toString(),conversation,response.executionId());
            code("CHAT_PLAN_EXECUTION_CLOSED",()->service.update(actualOwner,command(1),()->false));
            var failedStore=org.mockito.Mockito.mock(ChatPlanStore.class);
            org.mockito.Mockito.doThrow(new org.springframework.dao.DataAccessResourceFailureException("offline")).when(failedStore).open(org.mockito.ArgumentMatchers.any());
            org.springframework.test.util.ReflectionTestUtils.setField(app,"plans",new ChatPlanService(failedStore));
            int before=calls.get();
            code("CHAT_PLAN_STORE_UNAVAILABLE",()->app.send(conversation,"{\"message\":\"inspect\",\"toolMode\":\"git_status\"}"));
            assertEquals(before,calls.get(),"No provider execution without durable owner registration");
        } finally {app.shutdownTurns();}
    }

    @Test void malformedAttemptsConsumeTranscriptAllowance() {
        var tool=new ChatPlanTool(service,owner,()->false,snapshot->{});
        assertEquals("INVALID_CHAT_PLAN",tool.call("{"));
        int first=tool.transcriptChars();
        assertTrue(first>1024);
        assertEquals("INVALID_CHAT_PLAN",tool.call("oops"));
        assertTrue(tool.transcriptChars()>first+1024);
        assertNull(service.read(owner));
    }
    @Test void oversizeRawArgumentsHaltBeforeSecondProviderPrompt() {
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        var model=FakeChatModels.scripted(prompt->{
            calls.incrementAndGet();
            return new org.springframework.ai.chat.model.ChatResponse(List.of(new org.springframework.ai.chat.model.Generation(
                org.springframework.ai.chat.messages.AssistantMessage.builder().content("").toolCalls(List.of(new org.springframework.ai.chat.messages.AssistantMessage.ToolCall("oversize","function","update_execution_plan",
                    " ".repeat(30000)+"{}"))).build())));
        });
        var client=ChatClients.createClient(org.springframework.ai.chat.client.ChatClient.builder(model),org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().build());
        var chat=new EngineeringChatService(client,new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of()),root,
            new com.lh.eap.application.service.FileExecutionArtifactStore(root.resolve("budget-artifacts")));
        var tool=new ChatPlanTool(service,owner,()->false,snapshot->{throw new AssertionError("Must not mutate");});
        var outcome=chat.chat(new EngineeringChatService.Request(owner.principal(),owner.conversationId(),root,false,"inspect"),false,null,TaskContext.EMPTY,
            owner.executionId(),()->false,null,null,tool);
        assertEquals("CONTEXT_BUDGET_EXCEEDED",outcome.error()); assertEquals(1,calls.get()); assertNull(service.read(owner));
    }
    @Test void planReservationRejectsNearLimitBeforeProviderWhileNoPlanRemainsUnchanged() {
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        var handlers=new com.lh.eap.runtime.handler.CapabilityHandlerRegistry(List.of(new com.lh.eap.runtime.handler.CapabilityHandler() {
            public Set<String> capabilities(){return Set.of("git-status");}
            public com.lh.eap.domain.model.NodeResult handle(com.lh.eap.domain.model.CapabilityContext c){throw new AssertionError("No git needed");}
        }));
        var status=new AiConnectionStatus(handlers,root,root,"openai","offline","https://api.openai.com",true);
        var memory=org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().build();
        var model=FakeChatModels.scripted(prompt->{calls.incrementAndGet();return FakeChatModels.text("done");});
        var chat=new EngineeringChatService(ChatClients.createClient(org.springframework.ai.chat.client.ChatClient.builder(model),memory),handlers,root,
            new com.lh.eap.application.service.FileExecutionArtifactStore(root.resolve("preflight-artifacts")));
        var app=new AiChatApplication(status,new AiConversationRegistry(memory),chat,root);
        org.springframework.test.util.ReflectionTestUtils.setField(app,"plans",service);
        try {
            var noPlan=app.open("{}").conversationId();
            var withPlan=app.open("{}").conversationId();
            for(var id:List.of(noPlan,withPlan)) memory.add(ChatClients.memoryKey(AiConversationRegistry.PRINCIPAL,id),new org.springframework.ai.chat.messages.UserMessage("h".repeat(40000)));
            String message="m".repeat(30000);
            app.send(noPlan,"{\"message\":\""+message+"\",\"toolMode\":\"none\"}");
            assertEquals(1,calls.get());
            var rejected=assertThrows(ResponseStatusException.class,()->app.send(withPlan,"{\"message\":\""+message+"\",\"toolMode\":\"git_status\"}"));
            assertEquals("CONTEXT_BUDGET_EXCEEDED",rejected.getReason()); assertEquals(1,calls.get());
            var budget=(ContextBudget.Observation)rejected.getBody().getProperties().get("contextBudget");
            assertTrue(budget.usedChars()+budget.outputReserve()>budget.platformLimit());
            assertTrue(budget.sources().stream().anyMatch(source->source.source().equals("execution_plan_tools") && source.chars()==ChatPlanTool.RESERVED_CHARS));
            assertEquals(2,jdbc.queryForObject("SELECT count(*) FROM eap.chat_plan_execution",Integer.class));
        } finally {app.shutdownTurns();}
    }

}
