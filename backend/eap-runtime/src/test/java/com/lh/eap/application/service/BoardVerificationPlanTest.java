package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.DefaultProcessExecutor;
import com.lh.eap.core.LocalBinaries;
import com.lh.eap.domain.model.CapabilityAvailability;
import java.nio.file.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import tools.jackson.databind.json.JsonMapper;

class BoardVerificationPlanTest {
    @TempDir Path repo;
    @Test void windowsChildCommandsResolveInstalledPackageShimsWithoutInheritingExtraExtensions() {
        var environment = BoardVerificationPlanSupport.environment();
        if (LocalBinaries.isWindows()) assertEquals(".COM;.EXE;.BAT;.CMD", environment.get("PATHEXT"));
        assertFalse(environment.containsKey("NODE_OPTIONS"));
        assertFalse(environment.containsKey("NPM_TOKEN"));
    }
    @Test void realGitHeadAndUntrackedSourceBindTheFixedPlan() throws Exception {
        try (var executor = new DefaultProcessExecutor()) {
            Files.createDirectories(repo.resolve("frontend/node_modules"));
            Files.writeString(repo.resolve("frontend/package.json"), "{}");
            Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 1;");
            for (var command : List.of(List.of("git", "init"), List.of("git", "add", "frontend/package.json"), List.of("git", "-c", "user.name=EAP Test", "-c", "user.email=test@example.invalid", "-c", "commit.gpgsign=false", "commit", "-m", "baseline")))
                assertEquals(0, executor.runIsolated("fixture", repo, command, GitCapability.environment()).exitCode());
            var channels = mock(CliChannels.class);
            var binary = LocalBinaries.resolve("git").orElseThrow().toString(); // Never execute a verification command in this plan-only test.
            when(channels.channel("vp", "vp")).thenReturn(new CliChannels.Channel("vp", binary, "operator", binary, CapabilityAvailability.AVAILABLE));
            var type = assertDoesNotThrow(() -> Class.forName("com.lh.eap.application.service.BoardVerificationPlanSupport"), "plan support is missing");
            var support = type.getConstructor(ProcessExecutor.class, CliChannels.class, BoardVerificationSource.class).newInstance(executor, channels, new BoardVerificationSource());
            var method = type.getMethod("prepare", Path.class, GitCapability.class);
            var json = JsonMapper.builder().build();
            var first = json.valueToTree(method.invoke(support, repo, new GitCapability("status")));
            assertTrue(first.get("baseCommit").asText().matches("[a-f0-9]{40}|[a-f0-9]{64}"));
            assertEquals(3, first.get("commands").size());
            assertEquals("vue-tsc", first.get("commands").get(0).get("command").get(2).asText());
            assertEquals(120, first.get("commands").get(0).get("timeoutSeconds").asInt());
            assertEquals(first, json.valueToTree(method.invoke(support, repo, new GitCapability("status"))));
            Files.writeString(repo.resolve("frontend/source.ts"), "export const value = 2;");
            assertNotEquals(first.get("planHash"), json.valueToTree(method.invoke(support, repo, new GitCapability("status"))).get("planHash"));
        }
    }
}
