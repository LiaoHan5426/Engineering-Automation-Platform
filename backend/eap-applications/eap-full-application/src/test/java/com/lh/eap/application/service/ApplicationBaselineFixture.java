package com.lh.eap.application.service;

import com.lh.eap.api.*;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.mockito.Mockito.*;

/** Explicit deterministic Git identity; filesystem hashes use the production scanner. */
public final class ApplicationBaselineFixture {
    private ApplicationBaselineFixture() {}
    public static BoardApplicationBaseline create(JdbcTemplate jdbc) {
        var process=mock(ProcessExecutor.class);
        when(process.runIsolated(anyString(),any(),anyList(),anyMap())).thenAnswer(call -> {
            Path root=call.getArgument(1); java.util.List<String> command=call.getArgument(2);
            return new Observation("git-status",true,0,command.contains("--show-toplevel")?root.toRealPath().toString():"a".repeat(40),"",
                    Map.of("processExited",true,"processTreeCleanup",true));
        });
        return new BoardApplicationBaseline(jdbc,process,new CapabilityRegistry().register(new GitCapability("status")),new BoardVerificationSource());
    }
}
