package com.lh.eap.core;

import java.util.ArrayList;
import java.util.Map;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class DescendantEvidenceTest {
    @Test void throttlesChangesAndFlushesPendingEvidenceWithoutRepeatingUnchangedSnapshots() {
        var evidence = new DescendantEvidence();
        var calls = new ArrayList<Map<String,Object>>();
        evidence.publish(calls::add, true);
        assertTrue(calls.isEmpty());
        var first = mock(ProcessHandle.class); when(first.pid()).thenReturn(1L);
        when(first.info()).thenReturn(mock(ProcessHandle.Info.class));
        evidence.capture(first); evidence.publish(calls::add, false);
        var second = mock(ProcessHandle.class); when(second.pid()).thenReturn(2L);
        when(second.info()).thenThrow(new SecurityException("fixture"));
        evidence.capture(second); evidence.publish(calls::add, false);
        assertEquals(1, calls.size());
        evidence.publish(calls::add, true); evidence.publish(calls::add, true);
        assertEquals(2, calls.size());
        assertEquals(1, ((java.util.List<?>) calls.getFirst().get("processDescendants")).size());
        assertEquals(2, ((java.util.List<?>) calls.getLast().get("processDescendants")).size());
    }
}
