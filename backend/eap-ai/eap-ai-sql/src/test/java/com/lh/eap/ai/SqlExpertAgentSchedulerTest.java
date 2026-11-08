package com.lh.eap.ai;

import com.lh.eap.core.ExpertAgentJournal;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SqlExpertAgentSchedulerTest {
    @Test void disabledSchedulerRejectsSubmissionsAndDoesNotScanOrInvokeModel() {
        var agent = mock(SqlExpertAgentService.class); var journal = mock(ExpertAgentJournal.class);
        var scheduler = new SqlExpertAgentScheduler(agent, journal, false, 500);
        try {
            scheduler.start(); scheduler.tick(); assertFalse(scheduler.available());
            assertThrows(ResponseStatusException.class, () -> scheduler.enqueue("fixture", UUID.randomUUID(), new SqlExpertAgentService.Request("select 1", "", null, null)));
            verifyNoInteractions(agent, journal);
        } finally { scheduler.close(); }
    }
    @Test void transientScanFailureDoesNotStopSubsequentScheduledTicks() throws Exception {
        var agent = mock(SqlExpertAgentService.class); var journal = mock(ExpertAgentJournal.class);
        var pending = new ExpertAgentJournal.Pending(UUID.randomUUID(), "fixture", 0);
        doThrow(new IllegalStateException("fixture")).doNothing().when(journal).recoverExpired();
        when(journal.pending(4)).thenReturn(List.of(pending));
        var executed = new CountDownLatch(1);
        when(agent.resume("fixture", pending.id())).thenAnswer(call -> { executed.countDown(); return null; });
        var scheduler = new SqlExpertAgentScheduler(agent, journal, true, 500);
        try { scheduler.start(); assertTrue(executed.await(3, TimeUnit.SECONDS)); }
        finally { scheduler.close(); }
        verify(journal, atLeast(2)).recoverExpired();
    }
}
