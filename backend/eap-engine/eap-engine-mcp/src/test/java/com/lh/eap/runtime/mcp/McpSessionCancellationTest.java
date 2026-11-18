package com.lh.eap.runtime.mcp;

import static org.junit.jupiter.api.Assertions.*;
import java.util.UUID;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import org.junit.jupiter.api.Test;

class McpSessionCancellationTest {
    @Test void blockedInitializationDoesNotHoldGlobalMonitorAndLateSessionIsClosed() throws Exception {
        var registry=new McpSessionRegistry();var id=UUID.randomUUID();var other=UUID.randomUUID();
        registry.beginExecution(id,"voice");registry.beginExecution(other,"other");
        var started=new CountDownLatch(1);var release=new CountDownLatch(1);var closed=new AtomicBoolean();
        var result=new CompletableFuture<Object>();
        var worker=Thread.ofVirtual().start(()->{
            try{result.complete(registry.session(new McpCallScope(id,"voice","chosen","mcp.chosen.transcribe"),()->{
                started.countDown();
                while(true){try{release.await();break;}catch(InterruptedException ignored){}}
                return new McpSessionRegistry.McpSession(){public String serverId(){return "chosen";}public void close(){closed.set(true);}};
            }));}catch(Throwable failure){result.completeExceptionally(failure);}
        });
        assertTrue(started.await(1,TimeUnit.SECONDS));
        try{
            assertTimeoutPreemptively(java.time.Duration.ofMillis(500),()->{
                assertEquals(0,registry.endExecution(id));
                var separate=registry.session(new McpCallScope(other,"other","chosen","mcp.chosen.read_graph"),()->new McpSessionRegistry.McpSession(){public String serverId(){return "chosen";}public void close(){}});
                assertNotNull(separate);
            });
        }finally{release.countDown();}
        assertThrows(ExecutionException.class,()->result.get(1,TimeUnit.SECONDS));
        worker.join(1000);assertTrue(closed.get());assertEquals(1,registry.openSessionCount());registry.closeAll();
    }
}
