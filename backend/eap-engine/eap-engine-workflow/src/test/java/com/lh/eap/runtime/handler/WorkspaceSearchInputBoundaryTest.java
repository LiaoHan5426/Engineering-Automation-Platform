package com.lh.eap.runtime.handler;

import com.lh.eap.api.*;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.domain.model.*;
import com.lh.eap.local.WorkspaceSearchInput;
import java.nio.file.Path;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WorkspaceSearchInputBoundaryTest {
    @Test void missingWrongBlankAndOversizedInputNeverInvokeTheExecutor() {
        var executor = mock(ProcessExecutor.class);
        var registry = mock(CapabilityRegistry.class);
        var handler = new WorkspaceSearchHandler(registry, executor);
        record Unrelated(String pattern) implements CapabilityRequest {}
        for (CapabilityRequest input : Arrays.<CapabilityRequest>asList(null, new Unrelated("secret"),
                (WorkspaceSearchInput) () -> " ", (WorkspaceSearchInput) () -> "x".repeat(501))) {
            var result = handler.handle(context(input));
            assertFalse(result.success());
            assertTrue(result.incomplete());
        }
        verifyNoInteractions(registry, executor);
    }

    @Test void localOnlyInputUsesTheExistingCapabilityAndServerWorkspace() {
        var capability = mock(Capability.class);
        var executor = mock(ProcessExecutor.class);
        when(capability.name()).thenReturn("rg-search");
        when(capability.execute(any(), any(String[].class)))
                .thenReturn(new Observation("rg-search", true, 1, "", "", Map.of()));
        var registry = new CapabilityRegistry().register(capability);
        var result = new WorkspaceSearchHandler(registry, executor)
                .handle(context((WorkspaceSearchInput) () -> "  build failure  "));
        assertTrue(result.success());
        verify(capability).execute(argThat(scope -> scope.workspace().equals(Path.of("trusted-workspace"))), eq("build failure"));
    }

    private static CapabilityContext context(CapabilityRequest request) {
        return new CapabilityContext(new ExpertManifest.Step("search", "Search", "rg-search", true), request,
                "", "question", "expert", UUID.randomUUID(), List.of(), new HashMap<>(), new HashMap<>(),
                new ArrayList<>(), new ArrayList<>(), List.of(), Path.of("trusted-workspace"), Set.of());
    }
}
