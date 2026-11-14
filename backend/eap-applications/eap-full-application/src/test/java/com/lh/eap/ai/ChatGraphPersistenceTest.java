package com.lh.eap.ai;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.ai.dto.AiMessageResponse;

class ChatGraphPersistenceTest {
    JdbcTemplate jdbc; ChatGraphStore store; ChatGraphStore.Owner owner;
    @BeforeEach void setup() {
        var ds=new DriverManagerDataSource("jdbc:h2:mem:graph_"+UUID.randomUUID()+";MODE=PostgreSQL;DB_CLOSE_DELAY=-1","sa","");
        jdbc=new JdbcTemplate(ds); jdbc.execute("CREATE SCHEMA eap");
        new org.springframework.jdbc.datasource.init.ResourceDatabasePopulator(new org.springframework.core.io.ClassPathResource("db/migration/V3__chat_message_graph.sql")).execute(ds);
        store=new ChatGraphStore(jdbc,new DataSourceTransactionManager(ds));
        owner=new ChatGraphStore.Owner("operator","/workspace",UUID.randomUUID()); store.open(owner);
    }
    ChatGraphStore.Reservation reserve(long rev,String kind,UUID parent,UUID target,String text) {
        var id=UUID.randomUUID(); return store.reserve(owner,id,id.toString(),rev,kind,parent,target,text,false);
    }
    AiMessageResponse complete(ChatGraphStore.Reservation r,String text) {
        var response=new AiMessageResponse(r.operation().executionId(),text,"","SUCCEEDED","","",List.of(),"",List.of());
        store.finish(owner,r,response); return response;
    }
    @Test void rootEditRegenerateAndDeepSiblingsKeepImmutablePathsAndEvidence() {
        var root=reserve(0,"send",null,null,"root"); var original=complete(root,"root answer");
        var deep=reserve(1,"send",root.operation().assistantMessageId(),null,"deep"); complete(deep,"deep answer");
        var edit=reserve(2,"edit",null,root.operation().userMessageId(),"edited root"); complete(edit,"edited answer");
        assertTrue(store.history(edit).isEmpty());
        var regen=reserve(3,"regenerate",root.operation().userMessageId(),root.operation().assistantMessageId(),""); complete(regen,"alternative");
        assertEquals(root.operation().userMessageId(),regen.operation().userMessageId());
        var follow=reserve(4,"send",regen.operation().assistantMessageId(),null,"follow");
        assertEquals(List.of("root","alternative"),store.history(follow).stream().map(ChatGraphStore.Node::content).toList());
        var graph=store.read(owner);
        assertEquals(original,ChatGraphStore.node(graph,root.operation().assistantMessageId()).response());
        assertEquals("deep answer",ChatGraphStore.node(graph,deep.operation().assistantMessageId()).content());
        assertEquals(9,graph.nodes().size());
    }
    @Test void dedupePrecedesRevisionAndConflictDoesNotMutateGraph() {
        var first=reserve(0,"send",null,null,"hello");
        var retry=store.reserve(owner,first.operation().operationId(),first.operation().payload(),999,"send",null,null,"different",false);
        assertFalse(retry.fresh()); assertEquals(first.operation(),retry.operation());
        assertEquals("CHAT_OPERATION_CONFLICT",assertThrows(ResponseStatusException.class,()->store.find(owner,first.operation().operationId(),"changed")).getReason());
        assertEquals(1,store.read(owner).revision());
        assertEquals("CONVERSATION_BUSY",assertThrows(ResponseStatusException.class,()->reserve(1,"send",null,null,"other")).getReason());
        complete(first,"answer");
        assertEquals("CHAT_REVISION_CONFLICT",assertThrows(ResponseStatusException.class,()->reserve(0,"send",null,null,"stale")).getReason());
    }
    @Test void concurrentReservationsHaveExactlyOneWinner() throws Exception {
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var gate=new CountDownLatch(1); List<Future<Boolean>> futures=new ArrayList<>();
            for(int n=0;n<8;n++) futures.add(pool.submit(()->{gate.await();try {reserve(0,"send",null,null,"race");return true;}catch(ResponseStatusException conflict){return false;}}));
            gate.countDown(); int won=0;for(var f:futures)if(f.get())won++;
            assertEquals(1,won);assertEquals(2,store.read(owner).nodes().size());
        }
    }
    @Test void restartPreservesReadableHistoryButCannotPretendToResumeExecution() {
        var root=reserve(0,"send",null,null,"root");complete(root,"answer");
        var pending=reserve(1,"send",root.operation().assistantMessageId(),null,"pending");
        var restarted=new ChatGraphStore(jdbc,new DataSourceTransactionManager(jdbc.getDataSource()));
        var read=restarted.read(owner);
        assertEquals("answer",ChatGraphStore.node(read,root.operation().assistantMessageId()).content());
        var incomplete=ChatGraphStore.node(read,pending.operation().assistantMessageId());
        assertEquals("CREATED",incomplete.status()); assertFalse(incomplete.observationAvailable()); assertNull(incomplete.response());
        var next=restarted.reserve(owner,UUID.randomUUID(),"new",2,"send",root.operation().assistantMessageId(),null,"next",false);
        assertNotEquals(pending.operation().executionId(),next.operation().executionId());
        assertFalse(ChatGraphStore.node(restarted.read(owner),pending.operation().assistantMessageId()).observationAvailable());
    }
    @Test void ownerIsolationOrderingAndClearBoundaryCannotBeBypassedByOldBranch() {
        var root=reserve(0,"send",null,null,"root");complete(root,"answer");
        assertThrows(ResponseStatusException.class,()->store.read(new ChatGraphStore.Owner("other",owner.workspace(),owner.conversationId())));
        assertThrows(ResponseStatusException.class,()->reserve(1,"send",root.operation().userMessageId(),null,"invalid"));
        assertThrows(ResponseStatusException.class,()->reserve(1,"edit",UUID.randomUUID(),root.operation().userMessageId(),"invalid"));
        store.boundary(owner);
        var next=reserve(1,"send",root.operation().assistantMessageId(),null,"fresh"); assertTrue(store.history(next).isEmpty());
    }
    @Test void sensitiveMaterialAndItsDerivedAnswersNeverReenterProviderContext() {
        var id=UUID.randomUUID();var root=store.reserve(owner,id,"sensitive",0,"send",null,null,"knowledge question",true);complete(root,"sensitive answer");
        var next=reserve(1,"send",root.operation().assistantMessageId(),null,"follow"); assertTrue(store.history(next).isEmpty());
        assertTrue(next.graph().sensitive()); assertFalse(ChatGraphStore.node(next.graph(),next.operation().userMessageId()).safe());
    }
    @Test void lateTargetCancelDoesNotInterruptNextExecution() {
        var registry=new AiConversationRegistry(org.springframework.ai.chat.memory.MessageWindowChatMemory.builder().build());
        var session=registry.open(java.nio.file.Path.of("/workspace"),"workspace"); var old=UUID.randomUUID();var next=UUID.randomUUID();
        registry.exclusive(session.id,()->{registry.bindExecution(session.id,next);assertFalse(registry.cancel(session.id,old));assertFalse(registry.cancelRequested(session.id));return null;});
        assertFalse(Thread.interrupted());
    }
}
