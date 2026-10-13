package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.lh.eap.api.Observation;
import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.domain.model.*;
import com.lh.eap.persistence.mapper.*;
import com.lh.eap.runtime.handler.*;
import com.lh.eap.web.dto.*;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class CliProgramsTest {
    private final CliProgramMapper mapper = mock(CliProgramMapper.class);
    private final CliChannels channels = mock(CliChannels.class);
    private final CapabilityUsage usage = mock(CapabilityUsage.class);
    private final CliProgramService service = new CliProgramService(mapper, channels, usage);
    private final CliProgram git = new CliProgram("git", "Git", "git", true);
    private final CliOperation log = new CliOperation("git-log", "git", "查看提交", List.of("log", "--oneline"), "只读", false);

    @Test void duplicateProgramsCannotBeRegisteredAgain() {
        when(mapper.program("git")).thenReturn(Optional.of(git));
        var error = assertThrows(ResponseStatusException.class, () -> service.register(new CliProgramRequest("git", "Git", "git")));
        assertEquals(HttpStatus.CONFLICT, error.getStatusCode());
        verify(mapper, never()).insertProgram(any());
    }

    @Test void newOperationReusesProgramAndPreservesArgumentBoundaries() {
        when(mapper.program("git")).thenReturn(Optional.of(git));
        when(mapper.operations()).thenReturn(List.of());
        var result = service.saveOperation("git", "git-log", new CliOperationRequest("git-log", "查看提交", List.of("log", "--format=%s %b", ""), "说明"), true);
        assertEquals(List.of("log", "--format=%s %b", ""), result.args());
        verify(mapper).saveOperation(result, true);
        verify(mapper, never()).insertProgram(any());
    }

    @Test void builtinsAndExpertScopedIdsCannotBeOverwritten() {
        when(mapper.program("git")).thenReturn(Optional.of(git));
        for (var id : List.of("git-status", "mcp.files.read", "sql.parse")) {
            assertThrows(ResponseStatusException.class, () -> service.saveOperation("git", id, new CliOperationRequest(id, "x", List.of(), ""), true));
        }
        verify(mapper, never()).saveOperation(any(), anyBoolean());
    }

    @Test void sameExecutableCannotBeDuplicatedUnderAnotherProgramId() {
        when(mapper.program("another-git")).thenReturn(Optional.empty());
        when(mapper.programs()).thenReturn(List.of(git));
        assertThrows(ResponseStatusException.class, () -> service.register(new CliProgramRequest("another-git", "Git again", "git")));
        verify(mapper, never()).insertProgram(any());
    }

    @Test void credentialsAndControlCharactersAreRefusedBeforePersistence() {
        when(mapper.program("git")).thenReturn(Optional.of(git));
        when(mapper.operations()).thenReturn(List.of());
        for (var args : List.of(List.of("--token=secret"), List.of("log\nstatus"))) {
            assertThrows(ResponseStatusException.class, () -> service.saveOperation("git", "git-log", new CliOperationRequest("git-log", "x", args, ""), true));
        }
        verify(mapper, never()).saveOperation(any(), anyBoolean());
    }

    @Test void editingOrDeletingOperationsUsedByEnabledExpertsIsRefused() {
        when(mapper.program("git")).thenReturn(Optional.of(git));
        when(mapper.operations()).thenReturn(List.of(log));
        var snapshot = mock(CapabilityUsage.Usage.class);
        when(usage.usage()).thenReturn(snapshot);
        when(snapshot.enabledFor("git-log")).thenReturn(List.of("reviewer"));
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class, () -> service.deleteOperation("git", "git-log")).getStatusCode());
        assertThrows(ResponseStatusException.class, () -> service.saveOperation("git", "git-log", new CliOperationRequest("git-log", "new", List.of("log"), ""), false));
        verify(mapper, never()).deleteOperation(anyString());
        verify(mapper, never()).saveOperation(any(), anyBoolean());
    }

    @Test void removingLastCustomOperationAlsoRemovesItsProgram() {
        var program = new CliProgram("lint", "Lint", "lint", false);
        var op = new CliOperation("repo.lint", "lint", "检查", List.of(), "", false);
        when(mapper.program("lint")).thenReturn(Optional.of(program));
        when(mapper.operations()).thenReturn(List.of(op), List.of());
        var snapshot = mock(CapabilityUsage.Usage.class);
        when(usage.usage()).thenReturn(snapshot);
        when(snapshot.enabledFor("repo.lint")).thenReturn(List.of());
        service.deleteOperation("lint", "repo.lint");
        verify(mapper).deleteOperation("repo.lint");
        verify(mapper).deleteProgram("lint");
    }

    @Test void dynamicRegistryPicksUpNewOperationsWithoutRestart() {
        var handler = new CliOperationHandler(mapper, channels, mock(ProcessExecutor.class));
        var registry = new CapabilityHandlerRegistry(List.of(handler));
        verifyNoInteractions(mapper); // No database reads while the application is being wired.
        when(mapper.operations()).thenReturn(List.of());
        assertTrue(registry.find("git-log").isEmpty());
        when(mapper.operations()).thenReturn(List.of(log));
        assertSame(handler, registry.find("git-log").orElseThrow());
        assertTrue(registry.platformNames().contains("git-log"));
        assertTrue(registry.names().contains("git-log"));
    }

    @Test void executionUsesArgumentArrayAndOnlyPublishesRedactedEvidence() {
        var javaBinary = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win") ? "java.exe" : "java").toString();
        when(mapper.operations()).thenReturn(List.of(log));
        when(mapper.program("git")).thenReturn(Optional.of(git));
        when(channels.binaryFor("git", "git")).thenReturn(javaBinary);
        var executor = mock(ProcessExecutor.class);
        when(executor.run(eq("git-log"), any(), any())).thenReturn(new Observation("git-log", true, 0, "password=secret\ncommit", "", Map.of()));
        var facts = new LinkedHashMap<String,Object>();
        var evidence = new ArrayList<Map<String,Object>>();
        var step = new ExpertManifest.Step("log", "查看提交", "git-log", true);
        var result = new CliOperationHandler(mapper, channels, executor).handle(new CapabilityContext(step, null, "", "", "reviewer", UUID.randomUUID(), List.of(), facts, new LinkedHashMap<>(), new ArrayList<>(), evidence, List.of(), Path.of(".")));
        assertTrue(result.success());
        assertTrue(facts.isEmpty());
        assertEquals(1, evidence.size());
        assertFalse(result.data().get("stdout").toString().contains("secret"));
        verify(executor).run("git-log", Path.of("."), List.of(javaBinary,"log","--oneline"));
    }
}
