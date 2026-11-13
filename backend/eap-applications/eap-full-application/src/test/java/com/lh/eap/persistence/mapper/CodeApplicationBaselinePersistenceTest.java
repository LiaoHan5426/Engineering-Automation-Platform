package com.lh.eap.persistence.mapper;

import com.lh.eap.application.service.*;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.delivery.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@EnabledIfEnvironmentVariable(named="EAP_RUN_SINGLE_CONTRACTS",matches="true")
class CodeApplicationBaselinePersistenceTest {
    @Test void lockedClaimCapturesOnceRollsBackFailureAndMigrationProtectsEvidence() throws Exception {
        var session=Files.createTempDirectory(Path.of("target"),"application-baseline-");
        String schema="eap_unknown_qa_"+UUID.randomUUID().toString().replace("-","");
        var admin=new JdbcTemplate(ToolUnknownReviewFixture.originalDataSource());
        try {
            CurrentContractTestSchema.migrate(session,schema);
            var ds=ToolUnknownReviewFixture.scopedDataSource(schema);var jdbc=new JdbcTemplate(ds);var manager=new DataSourceTransactionManager(ds);
            var root=Files.createDirectory(session.resolve("workspace")).toRealPath();Files.createDirectory(root.resolve("frontend"));
            Files.writeString(root.resolve("frontend/Page.vue"),"before");Files.writeString(root.resolve("frontend/dirty.ts"),"dirty");
            var actual=ApplicationBaselineFixture.create(jdbc);var baseline=mock(BoardApplicationBaseline.class);
            var count=new AtomicInteger();
            doAnswer(call->{count.incrementAndGet();return actual.capture(call.getArgument(0));}).when(baseline).capture(any());
            var store=new JdbcCodeProposalStore(jdbc,manager,baseline);
            var changes=new CodeChangeService(new RuntimeWorkspace(root,root.toString()),null,ignored->"",new JdbcCodeGenerationStore(jdbc,manager),store);
            var chat=UUID.randomUUID();String principal=RuntimeWorkspace.OPERATOR_LABEL;
            var generation=changes.prepareGeneration(principal,chat,"frontend/Page.vue","","");
            var proposal=changes.proposePrepared(principal,chat,generation.id(),"{\"files\":[{\"path\":\"frontend/Page.vue\",\"content\":\"after\"}]}",true);
            assertEquals("BOARD_DELIVERY_APPLICATION_BASELINE_REQUIRED",assertThrows(org.springframework.web.server.ResponseStatusException.class,()->actual.required(principal,chat,proposal.id(),root.toString())).getReason());
            doThrow(new IllegalStateException("capture failure")).when(baseline).capture(any());
            assertThrows(IllegalStateException.class,()->store.claim(principal,chat,proposal.id()));
            assertEquals("PROPOSED",store.find(principal,chat,proposal.id()).orElseThrow().status());
            assertNull(jdbc.queryForObject("SELECT application_baseline FROM eap.code_proposal WHERE id=?",String.class,proposal.id()));
            assertEquals("before",Files.readString(root.resolve("frontend/Page.vue")));
            doAnswer(call->{count.incrementAndGet();return actual.capture(call.getArgument(0));}).when(baseline).capture(any());
            try(var pool=Executors.newFixedThreadPool(2)) {
                var first=pool.submit(()->store.claim(principal,chat,proposal.id()));var second=pool.submit(()->store.claim(principal,chat,proposal.id()));
                assertNotEquals(first.get(10,TimeUnit.SECONDS),second.get(10,TimeUnit.SECONDS));
            }
            assertEquals(1,count.get());
            String saved=jdbc.queryForObject("SELECT application_baseline::text FROM eap.code_proposal WHERE id=?",String.class,proposal.id());
            assertNotNull(saved);
            assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update("UPDATE eap.code_proposal SET application_baseline=NULL WHERE id=?",proposal.id()));
            assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update("UPDATE eap.code_proposal SET application_baseline=jsonb_set(application_baseline,'{baseCommit}','\"bad\"'::jsonb) WHERE id=?",proposal.id()));
            assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update("INSERT INTO eap.code_proposal SELECT (jsonb_populate_record(NULL::eap.code_proposal,jsonb_set(to_jsonb(p),'{id}',to_jsonb(?::text)))).* FROM eap.code_proposal p WHERE id=?",UUID.randomUUID().toString(),proposal.id()));
            store.finish(principal,chat,proposal.id(),"APPLIED",new CodeChangeService.Applied(proposal.id(),List.of("frontend/Page.vue"),"",List.of(),"APPLIED",HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest("after".getBytes(java.nio.charset.StandardCharsets.UTF_8))),""),"");
            for(String malformed : List.of(
                    "jsonb_set(?::jsonb,'{source,files,1,bytes}','\"bad\"'::jsonb)",
                    "jsonb_set(?::jsonb,'{source,files,1,path}','\"frontend/Page.vue\"'::jsonb)",
                    "jsonb_set(?::jsonb,'{source,files,1,path}','\"frontend/AAA.ts\"'::jsonb)")) {
                var nextGeneration=changes.prepareGeneration(principal,chat,"frontend/Page.vue","","");
                var next=changes.proposePrepared(principal,chat,nextGeneration.id(),"{\"files\":[{\"path\":\"frontend/Page.vue\",\"content\":\"after\"}]}",true);
                assertThrows(org.springframework.dao.DataAccessException.class,()->jdbc.update(
                        "UPDATE eap.code_proposal SET status='APPLYING',started_at=now(),application_baseline="+malformed+" WHERE id=?",saved,next.id()));
                assertEquals("PROPOSED",store.find(principal,chat,next.id()).orElseThrow().status());
            }
            assertFalse(store.claim(principal,chat,proposal.id()));assertEquals(1,count.get());
            assertEquals(saved,jdbc.queryForObject("SELECT application_baseline::text FROM eap.code_proposal WHERE id=?",String.class,proposal.id()));
        } finally { admin.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE"); }
    }
}
