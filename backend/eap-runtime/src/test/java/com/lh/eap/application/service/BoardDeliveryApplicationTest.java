package com.lh.eap.application.service;

import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** In-memory database boundary double; actual transaction coverage remains gated PostgreSQL tests. */
class BoardDeliveryApplicationTest {
    private final JsonMapper json = JsonMapper.builder().build();
    private final UUID taskId=UUID.randomUUID(), run=UUID.randomUUID();
    private final JdbcTemplate jdbc=mock(JdbcTemplate.class);
    private final BoardTaskService tasks=mock(BoardTaskService.class);
    private final MissionExecutionStore executions=mock(MissionExecutionStore.class);
    private final MissionGitExecutionService git=mock(MissionGitExecutionService.class);
    private final BoardVerificationService verification=mock(BoardVerificationService.class);
    private final BoardDeliveryCapture capture=mock(BoardDeliveryCapture.class);
    private final BoardApplicationEvidence applications=mock(BoardApplicationEvidence.class);
    private final CapabilityRegistry registry=new CapabilityRegistry().register(new GitCapability("status"));
    private final Instant now=Instant.parse("2026-11-01T00:00:00Z");
    private final String hash=GitReviewCapture.hash("after");
    private final List<BoardDeliveryCapture.File> files=List.of(new BoardDeliveryCapture.File("frontend/source.ts", "absent", hash, "", "after"));
    private final BoardDeliveryService.ApplicationRef ref=new BoardDeliveryService.ApplicationRef(UUID.randomUUID(),UUID.randomUUID());
    private final BoardApplicationEvidence.Evidence evidence=new BoardApplicationEvidence.Evidence("POST_HOC",ref.conversationId(),ref.proposalId(),UUID.randomUUID(),"frontend/source.ts","absent",hash,now,null,null,now,"local-operator");
    private BoardTaskService.Task task;
    private String saved, requestHash, decisionHash;
    private BoardVerificationService.Record record;
    private BoardDeliveryService service() { return new BoardDeliveryService(jdbc,tasks,executions,git,registry,verification,capture,applications); }
    private BoardDeliveryService.Request request(boolean linked) { return new BoardDeliveryService.Request("p",1,"repo",ref.proposalId(),List.of("frontend/source.ts"),"test",linked ? ref : null); }
    @BeforeEach @SuppressWarnings("unchecked") void setup() throws Exception {
        task=new BoardTaskService.Task(taskId,"p","title","ready","","",1,List.of(),"normal","goal","criteria",false,null);
        var source=new BoardVerificationSource.Source("frontend",hash,List.of(new BoardVerificationSource.File("frontend/source.ts",hash,5)),List.of());
        var plan=new BoardVerificationPlanSupport.Plan("plan","repo","a".repeat(40),source,List.of());
        var checks=List.of("typecheck","test","build").stream().map(id -> new BoardVerificationService.Check(id,List.of(),"repo","PASSED",0,"","",false,true,now,now)).toList();
        record=new BoardVerificationService.Record(UUID.randomUUID(),"PASSED","",plan,checks,source,now,now);
        when(tasks.find(eq(taskId),eq("p"),anyBoolean())).thenAnswer(call -> task);
        doAnswer(call -> { task=new BoardTaskService.Task(taskId,"p","title",call.getArgument(1),"","",task.revision()+1,List.of(),"normal","goal","criteria",false,null); return null; }).when(tasks).deliveryTransition(any(),anyString());
        var execution=mock(MissionExecution.class); when(execution.status()).thenReturn("SUCCEEDED"); when(execution.workspacePath()).thenReturn("repo"); when(execution.executable()).thenReturn(((GitCapability)registry.all().iterator().next()).executable());
        when(executions.find(run)).thenReturn(Optional.of(execution));
        when(git.availability()).thenReturn(new MissionGitExecutionService.Availability(true,"repo","repo",""));
        when(verification.observePreflight(eq(taskId),eq(run),eq("repo"),any())).thenAnswer(call -> ((Supplier<?>)call.getArgument(3)).get());
        when(capture.capture(any(),any(),anyString(),any(),anyList())).thenReturn(files);
        when(applications.associate(eq(ref),eq("repo"),isNull(),any(),eq(files),any(),any(),any())).thenReturn(evidence);
        when(jdbc.query(anyString(),any(RowMapper.class),eq(taskId),eq(run))).thenAnswer(call -> {
            var rs=mock(ResultSet.class); when(rs.getString(1)).thenReturn(saved); when(rs.getString(2)).thenReturn(requestHash); when(rs.getString(3)).thenReturn(decisionHash); when(rs.getLong(4)).thenReturn(1L);
            when(rs.getString(5)).thenReturn(json.writeValueAsString(new BoardRunService.Snapshot("title","goal","criteria",null))); when(rs.getString(6)).thenReturn(json.writeValueAsString(record));
            return List.of(((RowMapper<?>)call.getArgument(1)).mapRow(rs,0));
        });
        when(jdbc.update(anyString(),any(),any(),eq(taskId),eq(run))).thenAnswer(call -> { saved=call.getArgument(1); if (((String)call.getArgument(0)).contains("delivery_request_hash")) requestHash=call.getArgument(2); else decisionHash=call.getArgument(2); return 1; });
    }
    @Test void capturesExplicitPostHocEvidenceAndReplaysWithoutProcessesOrSourceLookup() {
        var service=service(); var delivery=service.submit(taskId,run,request(true));
        assertEquals("CHAT_APPLIED_POST_HOC",delivery.source()); assertEquals(evidence,delivery.applicationEvidence()); assertEquals("acceptance",task.column());
        var order=inOrder(tasks,capture,applications); order.verify(tasks).find(taskId,"p",true); order.verify(tasks).lockWorkspace("repo"); order.verify(capture).capture(any(),any(),anyString(),any(),anyList()); order.verify(applications).associate(eq(ref),eq("repo"),isNull(),any(),eq(files),any(),any(),any());
        clearInvocations(capture,applications);
        assertEquals(delivery,service().submit(taskId,run,request(true))); assertEquals(delivery,service().get(taskId,run,"p").record()); verifyNoInteractions(capture,applications);
        assertEquals("BOARD_DELIVERY_REQUEST_CONFLICT",assertThrows(ResponseStatusException.class,()->service().submit(taskId,run,request(false))).getReason());
    }
    @Test void oldRequestRetainsExactHistoricalFingerprintAndDeliveryJsonCanOmitEvidence() {
        var request=request(false); var delivery=service().submit(taskId,run,request);
        String legacy="{\"projectId\":\"p\",\"revision\":1,\"workspacePath\":\"repo\",\"requestId\":\""+request.requestId()+"\",\"paths\":[\"frontend/source.ts\"],\"note\":\"test\"}";
        assertEquals(GitReviewCapture.hash(legacy),requestHash); assertEquals("EXTERNAL_MANUAL",delivery.source()); assertNull(delivery.applicationEvidence());
        var legacyMap=json.readValue(saved, java.util.LinkedHashMap.class); legacyMap.remove("applicationEvidence"); saved=json.writeValueAsString(legacyMap);
        clearInvocations(capture,applications);
        assertEquals(delivery,service().submit(taskId,run,request)); verifyNoInteractions(capture,applications);
    }
    @Test void acceptanceRevalidatesPersistentApplicationButRejectionDoesNotCaptureOrLookup() {
        var delivery=service().submit(taskId,run,request(true));
        when(applications.associate(any(),anyString(),any(),any(),anyList(),any(),any(),any())).thenThrow(BoardVerificationSource.denied("BOARD_DELIVERY_APPLICATION_NOT_APPLIED"));
        var accept=new BoardDeliveryService.Decide("p",2,UUID.randomUUID(),delivery.id(),"ACCEPT",true,true,"test only");
        assertEquals("BOARD_DELIVERY_APPLICATION_NOT_APPLIED",assertThrows(ResponseStatusException.class,()->service().decide(taskId,run,accept)).getReason());
        assertEquals("acceptance",task.column()); assertNull(service().get(taskId,run,"p").record().decision());
        clearInvocations(capture,applications);
        var reject=new BoardDeliveryService.Decide("p",2,UUID.randomUUID(),delivery.id(),"REJECT",false,false,"fixture rejected");
        var decided=service().decide(taskId,run,reject); assertEquals(evidence,decided.applicationEvidence()); assertEquals("ready",task.column());
        assertEquals(decided,service().decide(taskId,run,reject)); verifyNoInteractions(capture,applications);
    }
}
