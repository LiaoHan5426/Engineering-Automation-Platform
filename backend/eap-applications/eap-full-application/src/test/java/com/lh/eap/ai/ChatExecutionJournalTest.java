package com.lh.eap.ai;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class ChatExecutionJournalTest {
 @Test void concurrentSnapshotsAndDisconnectedObserver() throws Exception {
  var journal=new ChatExecutionJournal(); var conversation=UUID.randomUUID(); var id=UUID.randomUUID(); var emitter=journal.open(id,conversation);
  emitter.onEvent(event->{throw new IllegalStateException("disconnected");});
  try(var workers=Executors.newVirtualThreadPerTaskExecutor()) {
   var writer=workers.submit(()->{for(int i=0;i<400;i++) emitter.emit("answer.delta","x","","RUNNING",null); emitter.emit("final","","","SUCCEEDED",null);});
   for(int i=0;i<500;i++){var snap=journal.snapshot(conversation,id,0);assertEquals(snap.latestSequence(),snap.events().size());for(int j=0;j<snap.events().size();j++)assertEquals(j+1,snap.events().get(j).sequence());}
   writer.get(5,TimeUnit.SECONDS);
  }
  assertTrue(journal.snapshot(conversation,id,0).complete());
 }
 @Test void terminalSlotReservedAndActiveLogsNeverEvicted(){
  var journal=new ChatExecutionJournal();var conversation=UUID.randomUUID();var id=UUID.randomUUID();var emitter=journal.open(id,conversation);
  for(int i=0;i<ChatExecutionJournal.MAX_EVENTS-1;i++)emitter.emit("answer.delta","x","","RUNNING",null);
  assertThrows(org.springframework.web.server.ResponseStatusException.class,()->emitter.emit("tool","","","RUNNING",null));
  emitter.fail("LIMIT","FAILED"); assertTrue(journal.snapshot(conversation,id,0).complete());
  var active=UUID.randomUUID();journal.open(active,conversation);
  for(int i=0;i<ChatExecutionJournal.MAX_EXECUTIONS-1;i++)journal.open(UUID.randomUUID(),conversation);
  assertThrows(org.springframework.web.server.ResponseStatusException.class,()->journal.open(UUID.randomUUID(),conversation));
  assertFalse(journal.snapshot(conversation,active,0).complete());
 }
}
