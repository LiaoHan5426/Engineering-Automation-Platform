package com.lh.eap.application.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.core.DefaultProcessExecutor;
import com.lh.eap.runtime.handler.CapabilityHandlerRegistry;
import com.lh.eap.runtime.handler.GitInspectionHandler;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.domain.model.Mission;
import com.lh.eap.domain.model.MissionExecution;
import com.lh.eap.domain.model.MissionExecutionStatus;
import com.lh.eap.core.MissionStore;
import com.lh.eap.core.MissionExecutionStore;

class MissionGitExecutionServiceTest {
    @Test
    void resolvedHandlerStillRefusesAnEmptyAuthorizedRoot() {
        var registry = new CapabilityRegistry().register(new GitCapability("status"));
        var handlers = new CapabilityHandlerRegistry(List.of(new GitInspectionHandler(registry, new DefaultProcessExecutor())));
        assertTrue(handlers.resolveFor(null, "git-status").isPresent());
        var rows = new ArrayList<MissionExecution>();
        var missionId = UUID.randomUUID();
        var service = service(missionId, rows, handlers, registry);
        var denied = assertThrows(ResponseStatusException.class, () -> service.start(missionId));
        assertEquals("AUTHORIZED_ROOT_MISSING", denied.getReason());
        assertTrue(rows.isEmpty());
    }

    @Test
    void restartUnknownBlocksAnotherStart() {
        var rows = new ArrayList<MissionExecution>();
        var execution = open(UUID.randomUUID(), 42L, Instant.parse("2026-10-24T06:00:00Z"));
        rows.add(execution);
        var service = service(execution.missionId(), rows, new CapabilityHandlerRegistry(List.of()), new CapabilityRegistry());
        service.markRestartUnknown();
        assertEquals("RUNNING", rows.get(0).status());
        assertEquals(MissionGitExecutionService.RESTART_UNKNOWN, rows.get(0).unconfirmedReason());
        var again = service.start(execution.missionId());
        assertEquals(execution.id(), again.id());
        assertEquals(1, rows.size());
    }

    @Test
    void resolveUnknownUnblocksStartWithoutFabricatingExitEvidence() {
        var rows = new ArrayList<MissionExecution>();
        var execution = open(UUID.randomUUID(), 42L, Instant.parse("2026-10-24T06:00:00Z"));
        rows.add(execution);
        var service = service(execution.missionId(), rows, new CapabilityHandlerRegistry(List.of()), new CapabilityRegistry());
        service.markRestartUnknown();
        var resolved = service.resolveUnknown(execution.missionId(), execution.id(), "Reviewed process identity and logs");

        assertEquals("CLOSED_UNCONFIRMED", resolved.status());
        assertEquals(MissionGitExecutionService.RESTART_UNKNOWN, resolved.unconfirmedReason());
        assertEquals(null, resolved.exitCode());
        assertEquals(null, resolved.exitEvidence());
        assertEquals("Reviewed process identity and logs", resolved.resolution().note());
        assertEquals("local-operator", resolved.resolution().operator());
        assertEquals(execution.id(), resolved.resolution().executionId());

        // Unblocked: no in-flight row remains for the mission, so open(missionId) no longer returns
        // this row and a later authorized start can insert a new execution id. Old row is untouched.
        assertEquals(true, rows.stream()
                .noneMatch(row -> MissionExecutionStatus.fromWire(row.status()).active()));
        assertEquals("CLOSED_UNCONFIRMED", service.list(execution.missionId()).stream()
                .filter(row -> row.id().equals(execution.id())).findFirst().orElseThrow().status());
    }

    @Test
    void resolveUnknownRejectsShortNoteAndSecondResolution() {
        var rows = new ArrayList<MissionExecution>();
        var execution = open(UUID.randomUUID(), 42L, Instant.parse("2026-10-24T06:00:00Z"));
        rows.add(execution);
        var service = service(execution.missionId(), rows, new CapabilityHandlerRegistry(List.of()), new CapabilityRegistry());
        service.markRestartUnknown();

        var bad = assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown(execution.missionId(), execution.id(), "short"));
        assertEquals(400, bad.getStatusCode().value());
        service.resolveUnknown(execution.missionId(), execution.id(), "Reviewed process identity and logs");
        var second = assertThrows(ResponseStatusException.class,
                () -> service.resolveUnknown(execution.missionId(), execution.id(), "Reviewed once again fully"));
        assertEquals(409, second.getStatusCode().value());
    }

    private static MissionGitExecutionService service(UUID missionId, List<MissionExecution> rows,
                                                      CapabilityHandlerRegistry handlers, CapabilityRegistry capabilities) {
        var mission = new Mission(missionId, UUID.randomUUID(), "builder", "builder-alpha", "summary",
                "created", "not_started", "not_requested", "none", "not_requested", Instant.now());
        return new MissionGitExecutionService(new MissionStore() {
            @Override public void insert(Mission value) {}
            @Override public List<Mission> list() { return List.of(mission); }
            @Override public Optional<Mission> find(UUID id) { return mission.id().equals(id) ? Optional.of(mission) : Optional.empty(); }
            @Override public Optional<Mission> findByHandoff(UUID handoffId) { return Optional.empty(); }
            @Override public void updateExecution(UUID id, String execution) {}
        }, new MemoryExecutions(rows), handlers, new CapabilitySettings(null, null), capabilities,
                (ProcessExecutor) new DefaultProcessExecutor(), new RuntimeWorkspace(java.nio.file.Path.of("."), ""));
    }

    private static MissionExecution open(UUID missionId, long pid, Instant started) {
        return new MissionExecution(UUID.randomUUID(), missionId, "RUNNING", "git-status", "local-operator",
                "F:/repo", "label", "git.exe", "policy", pid, started, "operator", "git.exe",
                Instant.now(), null, null, null, null, null, null, false, "NOT_REQUIRED", Instant.now());
    }

    private static final class MemoryExecutions implements MissionExecutionStore {
        private final List<MissionExecution> rows;

        private MemoryExecutions(List<MissionExecution> rows) {
            this.rows = rows;
        }

        @Override public void insertOpen(MissionExecution execution) { rows.add(execution); }
        @Override public boolean claimCreated(UUID id) { throw new UnsupportedOperationException("This fixture tests synchronous execution only"); }
        @Override public Optional<MissionExecution> open(UUID missionId) {
            return rows.stream().filter(row -> row.missionId().equals(missionId))
                    .filter(row -> "CREATED".equals(row.status()) || "RUNNING".equals(row.status()) || "CANCELLING".equals(row.status()))
                    .findFirst();
        }
        @Override public Optional<MissionExecution> find(UUID id) { return rows.stream().filter(row -> row.id().equals(id)).findFirst(); }
        @Override public List<MissionExecution> list(UUID missionId) { return List.copyOf(rows); }
        @Override public List<MissionExecution> openAll() { return List.copyOf(rows); }
        @Override public void markCancelling(UUID id) {}
        @Override public void rememberProcess(UUID id, long pid, Instant startedAt, String user, String executable) {}
        @Override public void unconfirmed(UUID id, String reason) { replace(id, copy(find(id).orElseThrow(), reason, null)); }

        @Override public int resolveUnconfirmed(UUID id, String note, String operator, Instant resolvedAt) {
            var current = find(id).orElseThrow();
            boolean inFlight = "CREATED".equals(current.status()) || "RUNNING".equals(current.status()) || "CANCELLING".equals(current.status());
            if (!inFlight || current.unconfirmedReason() == null || current.resolution() != null) return 0;
            replace(id, current.closeUnconfirmed(new MissionExecution.Resolution(id, note, operator, resolvedAt)));
            return 1;
        }

        @Override
        public void finish(UUID id, UUID missionId, String status, String projection, String evidence, Integer exitCode,
                           String stdout, String stderr, boolean cancelRequested) {
            var current = find(id).orElseThrow();
            replace(id, new MissionExecution(current.id(), current.missionId(), status, current.capability(), current.principal(),
                    current.workspacePath(), current.workspaceLabel(), current.executable(), current.policySnapshot(),
                    current.osPid(), current.processStartedAt(), current.processUser(), current.processExecutable(),
                    current.startedAt(), Instant.now(), exitCode, stdout, stderr, evidence, null, cancelRequested,
                    current.approval(), current.createdAt()));
        }

        @Override public void failSameRow(UUID id, UUID missionId, String reason) {}

        private void replace(UUID id, MissionExecution next) {
            rows.replaceAll(row -> row.id().equals(id) ? next : row);
        }

        private static MissionExecution copy(MissionExecution current, String reason, String evidence) {
            return new MissionExecution(current.id(), current.missionId(), current.status(), current.capability(), current.principal(),
                    current.workspacePath(), current.workspaceLabel(), current.executable(), current.policySnapshot(),
                    current.osPid(), current.processStartedAt(), current.processUser(), current.processExecutable(),
                    current.startedAt(), current.finishedAt(), current.exitCode(), current.stdout(), current.stderr(),
                    evidence, reason, current.cancelRequested(), current.approval(), current.createdAt());
        }
    }
}
