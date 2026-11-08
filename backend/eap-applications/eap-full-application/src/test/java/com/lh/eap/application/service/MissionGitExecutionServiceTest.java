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
                (ProcessExecutor) new DefaultProcessExecutor(), new RuntimeWorkspace(java.nio.file.Path.of("."), "", ""));
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
