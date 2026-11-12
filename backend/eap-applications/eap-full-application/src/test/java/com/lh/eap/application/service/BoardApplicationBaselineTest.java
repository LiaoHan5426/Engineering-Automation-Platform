package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.delivery.CodeChangeService;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BoardApplicationBaselineTest {
    @TempDir Path root;
    private final String head="a".repeat(40);
    private final GitCapability git=new GitCapability("status");
    private final BoardVerificationSource sources=new BoardVerificationSource();
    private String currentHead=head;
    private ProcessExecutor process() {
        var process=mock(ProcessExecutor.class);
        when(process.runIsolated(anyString(),any(),anyList(),anyMap())).thenAnswer(call -> {
            List<String> command=call.getArgument(2);
            return new Observation("git-status",true,0,command.contains("--show-toplevel")?root.toRealPath().toString():currentHead,"",Map.of("processExited",true,"processTreeCleanup",true));
        });
        return process;
    }
    private CodeChangeService.Proposal proposal() {
        return new CodeChangeService.Proposal(UUID.randomUUID(),UUID.randomUUID(),root.toString(),"test",
                List.of(new CodeChangeService.Change("frontend/Page.vue","before","after",GitReviewCapture.hash("before"))),Instant.now(),false,true,"",null);
    }
    private void files() throws Exception {
        Files.createDirectory(root.resolve("frontend"));
        Files.writeString(root.resolve("frontend/Page.vue"),"before");
        Files.writeString(root.resolve("frontend/dirty.ts"),"existing dirty");
    }
    @Test void capturesFullDirtyBaselineWithoutSourceBodiesAndDeliversOnlyGenerationBefore() throws Exception {
        files();var process=process();
        var baseline=new BoardApplicationBaseline(mock(JdbcTemplate.class),process,new CapabilityRegistry().register(git),sources).capture(proposal());
        assertEquals(2,baseline.source().files().size()); assertEquals(head,baseline.baseCommit());
        Files.writeString(root.resolve("frontend/Page.vue"),"after");
        var capture=new BoardDeliveryCapture(process,sources);
        var result=capture.captureApplication(root,git,head,sources.snapshot(root),List.of("frontend/Page.vue"),baseline,proposal().files());
        assertEquals("before",result.getFirst().before());assertEquals("after",result.getFirst().after());
        assertEquals("existing dirty",Files.readString(root.resolve("frontend/dirty.ts")));
    }
    @ParameterizedTest @ValueSource(strings={"add","delete","change","head","acceptChange"})
    void anyUnselectedMutationOrHeadChangeBlocksCaptureAndAcceptanceRecapture(String mutation) throws Exception {
        files();var process=process();
        var baseline=new BoardApplicationBaseline(mock(JdbcTemplate.class),process,new CapabilityRegistry().register(git),sources).capture(proposal());
        Files.writeString(root.resolve("frontend/Page.vue"),"after");
        var capture=new BoardDeliveryCapture(process,sources);var verified=sources.snapshot(root);
        if(mutation.equals("acceptChange")) assertEquals(1,capture.captureApplication(root,git,head,verified,List.of("frontend/Page.vue"),baseline,proposal().files()).size());
        switch(mutation) {
            case "add" -> Files.writeString(root.resolve("frontend/new.ts"),"new");
            case "delete" -> Files.delete(root.resolve("frontend/dirty.ts"));
            case "head" -> currentHead="b".repeat(40);
            default -> Files.writeString(root.resolve("frontend/dirty.ts"),"changed");
        }
        assertThrows(ResponseStatusException.class,()->capture.captureApplication(root,git,head,verified,List.of("frontend/Page.vue"),baseline,proposal().files()));
        if(!mutation.equals("head")) assertThrows(ResponseStatusException.class,()->capture.captureApplication(root,git,head,sources.snapshot(root),List.of("frontend/Page.vue"),baseline,proposal().files()));
    }
    @Test void changedSelectedSourceFailsClaimCaptureBeforeAnyWrite() throws Exception {
        files();Files.writeString(root.resolve("frontend/Page.vue"),"externally changed");
        var baselines=new BoardApplicationBaseline(mock(JdbcTemplate.class),process(),new CapabilityRegistry().register(git),sources);
        assertEquals("BOARD_DELIVERY_APPLICATION_SOURCE_MISMATCH",assertThrows(ResponseStatusException.class,()->baselines.capture(proposal())).getReason());
        assertEquals("externally changed",Files.readString(root.resolve("frontend/Page.vue")));
    }
}
