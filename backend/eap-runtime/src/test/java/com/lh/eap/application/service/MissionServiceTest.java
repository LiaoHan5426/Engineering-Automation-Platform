package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

class MissionServiceTest {
    @Test
    void createLinksAnExistingHandoffAndFixesTheShell() throws Exception {
        var handoff = handoff();
        var rows = new ArrayList<Mission>();
        var service = new MissionService(new MemoryHandoffs(List.of(handoff)), new MemoryMissions(rows));
        var mission = service.create(handoff.id());
        assertEquals(handoff.id(), mission.handoffId());
        assertEquals("结算页已改", mission.summary());
        assertEquals("created", mission.status());
        assertEquals("not_started", mission.execution());
        assertEquals("not_requested", mission.approval());
        assertEquals("none", mission.grant());
        assertEquals("not_requested", mission.verification());
        assertEquals(mission, service.detail(mission.id()));
        var sql = Files.readString(Path.of("src/main/resources/db/migration/V1__initial_schema.sql"));
        assertFalse(sql.contains("previous_mission"));
    }

    @Test
    void missingHandoffDoesNotInsert() {
        var rows = new ArrayList<Mission>();
        var service = new MissionService(new MemoryHandoffs(List.of()), new MemoryMissions(rows));
        var missing = assertThrows(ResponseStatusException.class, () -> service.create(UUID.randomUUID()));
        assertEquals(HttpStatus.NOT_FOUND, missing.getStatusCode());
        assertTrue(rows.isEmpty());
    }

    @Test
    void uniqueConflictReturnsTheSameMission() throws Exception {
        var handoff = handoff();
        var store = new ConflictMissions();
        var service = new MissionService(new MemoryHandoffs(List.of(handoff)), store);
        var start = new CountDownLatch(1);
        var results = new Mission[2];
        var threads = new Thread[2];
        for (var index = 0; index < 2; index++) {
            var slot = index;
            threads[index] = new Thread(() -> {
                try {
                    start.await();
                    results[slot] = service.create(handoff.id());
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                }
            });
            threads[index].start();
        }
        start.countDown();
        for (var thread : threads) thread.join();
        assertEquals(results[0].id(), results[1].id());
        assertEquals(1, store.rows.size());
    }

    @Test
    void databaseFailureIsNotACreatedShell() {
        var handoff = handoff();
        var service = new MissionService(new MemoryHandoffs(List.of(handoff)), new MissionStore() {
            @Override
            public void insert(Mission mission) {
                throw new DataAccessResourceFailureException("database down");
            }

            @Override
            public List<Mission> list() {
                return List.of();
            }

            @Override
            public Optional<Mission> find(UUID id) {
                return Optional.empty();
            }

            @Override
            public Optional<Mission> findByHandoff(UUID handoffId) {
                return Optional.empty();
            }

            @Override
            public void updateExecution(UUID id, String execution) {
                throw new UnsupportedOperationException();
            }
        });
        var failure = assertThrows(ResponseStatusException.class, () -> service.create(handoff.id()));
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, failure.getStatusCode());
    }

    private static Handoff handoff() {
        return new Handoff(
                UUID.randomUUID(),
                "builder",
                "builder-alpha",
                "结算页已改",
                "recorded",
                "not_started",
                "not_requested",
                "none",
                Instant.parse("2026-10-24T06:09:20.984072Z"));
    }

    private static final class MemoryHandoffs implements HandoffStore {
        private final List<Handoff> rows;

        private MemoryHandoffs(List<Handoff> rows) {
            this.rows = rows;
        }

        @Override
        public void insert(Handoff handoff) {
            rows.add(handoff);
        }

        @Override
        public List<Handoff> list() {
            return List.copyOf(rows);
        }

        @Override
        public Optional<Handoff> find(UUID id) {
            return rows.stream().filter(item -> item.id().equals(id)).findFirst();
        }
    }

    private static final class MemoryMissions implements MissionStore {
        private final List<Mission> rows;

        private MemoryMissions(List<Mission> rows) {
            this.rows = rows;
        }

        @Override
        public void insert(Mission mission) {
            rows.add(mission);
        }

        @Override
        public List<Mission> list() {
            return List.copyOf(rows);
        }

        @Override
        public Optional<Mission> find(UUID id) {
            return rows.stream().filter(item -> item.id().equals(id)).findFirst();
        }

        @Override
        public Optional<Mission> findByHandoff(UUID handoffId) {
            return rows.stream().filter(item -> item.handoffId().equals(handoffId)).findFirst();
        }

        @Override
        public void updateExecution(UUID id, String execution) {
            throw new UnsupportedOperationException();
        }
    }

    /** Both callers enter insert before either row is visible, matching a unique-constraint race. */
    private static final class ConflictMissions implements MissionStore {
        private final List<Mission> rows = new ArrayList<>();
        private final AtomicInteger arrived = new AtomicInteger();
        private final CountDownLatch bothInside = new CountDownLatch(2);

        @Override
        public void insert(Mission mission) {
            if (arrived.incrementAndGet() <= 2) bothInside.countDown();
            try {
                bothInside.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            }
            synchronized (rows) {
                if (rows.stream().anyMatch(item -> item.handoffId().equals(mission.handoffId()))) {
                    throw new DuplicateKeyException("mission_handoff_id_key");
                }
                rows.add(mission);
            }
        }

        @Override
        public List<Mission> list() {
            return List.copyOf(rows);
        }

        @Override
        public Optional<Mission> find(UUID id) {
            return rows.stream().filter(item -> item.id().equals(id)).findFirst();
        }

        @Override
        public Optional<Mission> findByHandoff(UUID handoffId) {
            synchronized (rows) {
                return rows.stream().filter(item -> item.handoffId().equals(handoffId)).findFirst();
            }
        }

        @Override
        public void updateExecution(UUID id, String execution) {
            throw new UnsupportedOperationException();
        }
    }
}
