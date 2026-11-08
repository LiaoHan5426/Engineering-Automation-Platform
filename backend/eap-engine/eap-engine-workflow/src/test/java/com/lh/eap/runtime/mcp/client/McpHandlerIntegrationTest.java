package com.lh.eap.runtime.mcp.client;

import com.lh.eap.runtime.handler.*;
import com.lh.eap.runtime.mcp.McpSessionRegistry;
import com.lh.eap.persistence.mapper.McpServerRegistry;
import com.lh.eap.domain.model.*;
import java.util.*;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class McpHandlerIntegrationTest {
 @Test void handlerRequiresPersistedGrantAndUsesRealIsolatedStdioProtocol() throws Exception {
  var registry=mock(McpServerRegistry.class);var sessions=new McpSessionRegistry();var client=new McpClientService(registry,sessions);
  String capability="mcp.memory.read_graph";
  var server=new McpServerRegistry.McpServer("memory","memory","stdio","npx -y @modelcontextprotocol/server-memory@2025.11.25",true,true,List.of("read_graph"));
  when(registry.usableServers()).thenReturn(List.of(server));when(registry.publishes(capability)).thenReturn(true);when(registry.serverOf(capability)).thenReturn(Optional.of("memory"));when(registry.find("memory")).thenReturn(Optional.of(server));
  var transports=new ArrayList<StdioMcpTransport>();
  client.registerInMemoryTransport("memory",()->{
   try {var transport=StdioMcpTransport.start(List.of(ProcessHandle.current().info().command().orElseThrow(),"-cp",System.getProperty("java.class.path"),FakeStdioMcpServerMain.class.getName(),"memory"),Path.of(""));transports.add(transport);return transport;}
   catch(java.io.IOException failure){throw new IllegalStateException(failure);}
  });
  var handler=new McpReadonlyHandler(registry,client);var execution=UUID.randomUUID();sessions.beginExecution(execution,"expert");
  var context=new CapabilityContext(new ExpertManifest.Step("read","read",capability,true),null,"","","expert",execution,List.of(),new HashMap<>(),new HashMap<>(),new ArrayList<>(),new ArrayList<>(),List.of(),Path.of(""), com.lh.eap.rules.SqlFactVocabulary.FACTS_BY_KEY.keySet());
  try {
   assertThrows(SecurityException.class,()->handler.handle(context));assertTrue(transports.isEmpty());
   when(registry.grants("expert")).thenReturn(List.of(capability));
   assertTrue(handler.handle(context).success());assertEquals(1,sessions.sessionCount("memory"));
   when(registry.grants("expert")).thenReturn(List.of());assertThrows(SecurityException.class,()->handler.handle(context));
  } finally {sessions.endExecution(execution);}
  assertFalse(transports.getFirst().alive());
 }
 @Test void initializeFailureClosesUnregisteredTransportAndUnknownReadonlyIsDenied() {
  var registry=mock(McpServerRegistry.class);var sessions=new McpSessionRegistry();var client=new McpClientService(registry,sessions);
  String capability="mcp.fixture.purge";when(registry.publishes(capability)).thenReturn(true);when(registry.serverOf(capability)).thenReturn(Optional.of("fixture"));
  when(registry.find("fixture")).thenReturn(Optional.of(new McpServerRegistry.McpServer("fixture","fixture","stdio","unknown-server",true,true,List.of("purge"))));
  var execution=UUID.randomUUID();sessions.beginExecution(execution,"expert");
  assertThrows(org.springframework.web.server.ResponseStatusException.class,()->client.callReadOnly(execution,"expert",capability,Map.of()));
  var closed=new java.util.concurrent.atomic.AtomicBoolean();
  client.registerInMemoryTransport("fixture",()->new McpTransport(){public String exchange(String request,java.time.Duration timeout)throws java.io.IOException{throw new java.io.IOException("fixture failure");}public void close(){closed.set(true);}});
  assertThrows(McpProtocolException.class,()->client.probe(execution,"expert",capability));assertTrue(closed.get());assertEquals(0,sessions.sessionCount("fixture"));sessions.endExecution(execution);
 }
}
