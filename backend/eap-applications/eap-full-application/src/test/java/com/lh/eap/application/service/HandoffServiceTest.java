package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class HandoffServiceTest {
    @Test
    void recordStoresAnIntentWithoutExecutionOrGrant() {
        var saved = new ArrayList<Handoff>();
        var service = new HandoffService(new MemoryHandoffs(saved));
        var handoff = service.record("builder", "builder-alpha", "结算页\n手工说明");
        assertEquals("recorded", handoff.status());
        assertEquals("not_started", handoff.execution());
        assertEquals("not_requested", handoff.approval());
        assertEquals("none", handoff.grant());
        assertEquals(1, saved.size());
        assertEquals(handoff, service.detail(handoff.id()));
    }

    @Test
    void rejectsAnUnknownSourceAndDoesNotStoreIt() {
        var saved = new ArrayList<Handoff>();
        var service = new HandoffService(new MemoryHandoffs(saved));
        assertThrows(IllegalArgumentException.class, () -> service.record("mission", "builder-alpha", "目标"));
        assertTrue(saved.isEmpty());
    }

    private static final class MemoryHandoffs implements HandoffStore {
        private final List<Handoff> saved;

        private MemoryHandoffs(List<Handoff> saved) {
            this.saved = saved;
        }

        @Override
        public void insert(Handoff handoff) {
            saved.add(handoff);
        }

        @Override
        public List<Handoff> list() {
            return List.copyOf(saved);
        }

        @Override
        public Optional<Handoff> find(UUID id) {
            return saved.stream().filter(item -> item.id().equals(id)).findFirst();
        }
    }
}
