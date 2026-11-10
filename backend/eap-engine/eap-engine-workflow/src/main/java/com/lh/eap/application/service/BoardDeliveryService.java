package com.lh.eap.application.service;

import com.lh.eap.capability.GitCapability;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.common.SensitiveData;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import static com.lh.eap.application.service.BoardVerificationSource.denied;

@Service
public class BoardDeliveryService {
    public record ApplicationRef(UUID conversationId, UUID proposalId) {}
    public record Request(String projectId, long revision, String workspacePath, UUID requestId, List<String> paths, String note,
                          @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL) ApplicationRef applicationRef) {
        public Request(String projectId, long revision, String workspacePath, UUID requestId, List<String> paths, String note) {
            this(projectId, revision, workspacePath, requestId, paths, note, null);
        }
    }
    public record Decide(String projectId, long revision, UUID requestId, UUID deliveryId, String decision, boolean criteriaConfirmed, boolean previewConfirmed, String comment) {}
    public record Decision(UUID id, UUID requestId, String decision, boolean criteriaConfirmed, boolean previewConfirmed, String comment, String operator, Instant createdAt) {}
    public record Delivery(UUID id, String source, UUID requestId, long taskRevision, long submittedRevision, String workspacePath, String baseCommit, UUID verificationId, String sourceHash, UUID prototypeVersionId, String goal, String acceptanceCriteria, String note, List<BoardDeliveryCapture.File> files, Instant createdAt, Decision decision, BoardApplicationEvidence.Evidence applicationEvidence) {
        public Delivery(UUID id, String source, UUID requestId, long taskRevision, long submittedRevision, String workspacePath, String baseCommit, UUID verificationId, String sourceHash, UUID prototypeVersionId, String goal, String acceptanceCriteria, String note, List<BoardDeliveryCapture.File> files, Instant createdAt, Decision decision) {
            this(id, source, requestId, taskRevision, submittedRevision, workspacePath, baseCommit, verificationId, sourceHash, prototypeVersionId, goal, acceptanceCriteria, note, files, createdAt, decision, null);
        }
    }
    public record Page(Delivery record, boolean prepareAllowed, String reason) {}
    private record Stored(Delivery delivery, String requestHash, String decisionHash, long revision, BoardRunService.Snapshot task, BoardVerificationService.Record verification) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final BoardTaskService tasks;
    private final MissionExecutionStore executions;
    private final MissionGitExecutionService git;
    private final CapabilityRegistry registry;
    private final BoardVerificationService verification;
    private final BoardDeliveryCapture capture;
    private final BoardApplicationEvidence applications;
    public BoardDeliveryService(JdbcTemplate jdbc, BoardTaskService tasks, MissionExecutionStore executions, MissionGitExecutionService git, CapabilityRegistry registry, BoardVerificationService verification, BoardDeliveryCapture capture) {
        this(jdbc, tasks, executions, git, registry, verification, capture, null);
    }
    @Autowired
    public BoardDeliveryService(JdbcTemplate jdbc, BoardTaskService tasks, MissionExecutionStore executions, MissionGitExecutionService git, CapabilityRegistry registry, BoardVerificationService verification, BoardDeliveryCapture capture, BoardApplicationEvidence applications) {
        this.jdbc=jdbc; this.tasks=tasks; this.executions=executions; this.git=git; this.registry=registry; this.verification=verification; this.capture=capture; this.applications=applications;
    }
    public BoardApplicationCatalog.Page applications(UUID taskId, UUID executionId, String projectId) {
        project(projectId);
        var task = tasks.find(taskId, projectId, false);
        var saved = read(taskId, executionId);
        var execution = executions.find(executionId).orElseThrow();
        return new BoardApplicationCatalog(jdbc).list(
                new com.lh.eap.api.TaskRef(task.projectId(), task.id(), saved.revision()), execution.workspacePath());
    }
    public Page get(UUID taskId, UUID executionId, String projectId) {
        project(projectId); var task = tasks.find(taskId, projectId, false); var saved = read(taskId, executionId);
        if (saved.delivery()!=null) return new Page(saved.delivery(), false, "BOARD_DELIVERY_ALREADY_RECORDED");
        String reason = reason(task, saved, executionId);
        return new Page(null, reason.isEmpty(), reason);
    }
    public Delivery submit(UUID taskId, UUID executionId, Request request) {
        project(request.projectId()); BoardDeliveryCapture.validatePaths(request.paths()); text(request.note());
        if (request.revision()<1 || request.requestId()==null || request.workspacePath()==null || request.workspacePath().isBlank() || request.workspacePath().length()>2048) throw new IllegalArgumentException("INVALID_BOARD_DELIVERY_REQUEST");
        if (request.applicationRef()!=null && (request.applicationRef().conversationId()==null || request.applicationRef().proposalId()==null)) throw new IllegalArgumentException("INVALID_BOARD_DELIVERY_REQUEST");
        String fingerprint = fingerprint(request);
        return verification.observePreflight(taskId, executionId, request.workspacePath(), () -> {
            var task = tasks.find(taskId, request.projectId(), true); var stored = read(taskId, executionId);
            if (stored.delivery()!=null) {
                if (!fingerprint.equals(stored.requestHash())) throw denied("BOARD_DELIVERY_REQUEST_CONFLICT");
                return stored.delivery();
            }
            if (task.revision()!=request.revision()) throw denied("BOARD_REVISION_CONFLICT");
            String denial = reason(task, stored, executionId); if (!denial.isEmpty()) throw denied(denial);
            var record = stored.verification(); var plan = record.plan();
            if (!plan.workspacePath().equals(request.workspacePath())) throw denied("BOARD_WORKSPACE_CHANGED");
            lock(task, request.workspacePath()); requireBound(executionId, request.workspacePath());
            var files = capture.capture(Path.of(request.workspacePath()), capability(), plan.baseCommit(), plan.source(), request.paths());
            var now = Instant.now();
            var evidence = request.applicationRef()==null ? null : applicationEvidence(request.applicationRef(), request.workspacePath(), stored, files, now, task);
            var delivery = new Delivery(UUID.randomUUID(), evidence==null ? "EXTERNAL_MANUAL" : "PREBOUND".equals(evidence.association()) ? "CHAT_APPLIED_PREBOUND" : "CHAT_APPLIED_POST_HOC", request.requestId(), task.revision(), task.revision()+1, request.workspacePath(), plan.baseCommit(), record.id(), plan.source().contentHash(), task.prototypeVersionId(), task.goal(), task.acceptanceCriteria(), SensitiveData.redact(request.note()), files, now, null, evidence);
            jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=?::jsonb,delivery_request_hash=? WHERE task_id=? AND execution_id=?", JSON.writeValueAsString(delivery), fingerprint, taskId, executionId);
            tasks.deliveryTransition(task, "acceptance"); return delivery;
        });
    }
    public Delivery decide(UUID taskId, UUID executionId, Decide request) {
        project(request.projectId()); text(request.comment());
        if (request.revision()<1 || request.requestId()==null || request.deliveryId()==null || request.decision()==null || !Set.of("ACCEPT","REJECT").contains(request.decision()) || (request.decision().equals("ACCEPT") && (!request.criteriaConfirmed() || !request.previewConfirmed())) || (request.decision().equals("REJECT") && request.comment().isBlank())) throw new IllegalArgumentException("INVALID_BOARD_DELIVERY_DECISION");
        // No process in this initial read. Task is re-read and locked inside the independent transaction.
        tasks.find(taskId, request.projectId(), false); var initial = read(taskId, executionId);
        if (initial.delivery()==null) throw denied("BOARD_DELIVERY_REQUIRED");
        return verification.observePreflight(taskId, executionId, initial.delivery().workspacePath(), () -> {
            var task = tasks.find(taskId, request.projectId(), true); var stored = read(taskId, executionId); var delivery = stored.delivery();
            if (!delivery.id().equals(request.deliveryId())) throw denied("BOARD_DELIVERY_REQUEST_CONFLICT");
            if (delivery.decision()!=null) {
                if (!fingerprint(request).equals(stored.decisionHash())) throw denied("BOARD_DELIVERY_REQUEST_CONFLICT");
                return delivery;
            }
            if (task.revision()!=request.revision() || task.revision()!=delivery.submittedRevision()) throw denied("BOARD_REVISION_CONFLICT");
            if (!task.column().equals("acceptance")) throw denied("BOARD_DELIVERY_STATE_CONFLICT");
            lock(task, delivery.workspacePath());
            if (request.decision().equals("ACCEPT")) {
                requireBound(executionId, delivery.workspacePath());
                if (!sameTask(task, stored, delivery.taskRevision()) || !passed(stored.verification()) || !stored.verification().id().equals(delivery.verificationId()) || !stored.verification().plan().baseCommit().equals(delivery.baseCommit()) || !stored.verification().plan().source().contentHash().equals(delivery.sourceHash()) || delivery.files().isEmpty()) throw denied("BOARD_DELIVERY_STALE");
                var currentFiles = capture.capture(Path.of(delivery.workspacePath()), capability(), delivery.baseCommit(), stored.verification().plan().source(), delivery.files().stream().map(BoardDeliveryCapture.File::path).toList());
                if (!currentFiles.equals(delivery.files())) throw denied("BOARD_DELIVERY_STALE");
                if (Set.of("CHAT_APPLIED_POST_HOC", "CHAT_APPLIED_PREBOUND").contains(delivery.source())) {
                    var evidence = delivery.applicationEvidence();
                    if (evidence==null || !evidence.equals(applicationEvidence(new ApplicationRef(evidence.conversationId(), evidence.proposalId()), delivery.workspacePath(), stored, currentFiles, evidence.associatedAt(), task)))
                        throw denied("BOARD_DELIVERY_APPLICATION_STALE");
                }
            }
            var decision = new Decision(UUID.randomUUID(), request.requestId(), request.decision(), request.criteriaConfirmed(), request.previewConfirmed(), SensitiveData.redact(request.comment()), "local-operator", Instant.now());
            var result = new Delivery(delivery.id(), delivery.source(), delivery.requestId(), delivery.taskRevision(), delivery.submittedRevision(), delivery.workspacePath(), delivery.baseCommit(), delivery.verificationId(), delivery.sourceHash(), delivery.prototypeVersionId(), delivery.goal(), delivery.acceptanceCriteria(), delivery.note(), delivery.files(), delivery.createdAt(), decision, delivery.applicationEvidence());
            jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=?::jsonb,delivery_decision_hash=? WHERE task_id=? AND execution_id=?", JSON.writeValueAsString(result), fingerprint(request), taskId, executionId);
            tasks.deliveryTransition(task, request.decision().equals("ACCEPT") ? "done" : "ready"); return result;
        });
    }
    private BoardApplicationEvidence.Evidence applicationEvidence(ApplicationRef ref, String workspace, Stored stored, List<BoardDeliveryCapture.File> files, Instant at, BoardTaskService.Task task) {
        if (applications==null) throw denied("BOARD_DELIVERY_APPLICATION_UNAVAILABLE");
        // Run revision is the original delivery revision, not the post-submit current task revision.
        return applications.associate(ref, workspace, stored.task().prototype(), stored.verification(), files, at,
                new com.lh.eap.api.TaskRef(task.projectId(), task.id(), stored.revision()), stored.task());
    }
    private void lock(BoardTaskService.Task task, String workspace) {
        if (tasks.hasActiveExecution(task.id())) throw denied("BOARD_EXECUTION_ACTIVE");
        tasks.lockWorkspace(workspace);
        if (tasks.hasActiveWorkspace(workspace)) throw denied("BOARD_VERIFICATION_WORKSPACE_BUSY");
    }
    private String reason(BoardTaskService.Task task, Stored stored, UUID executionId) {
        if (task.executionActive()) return "BOARD_EXECUTION_ACTIVE";
        if (!task.column().equals("ready")) return "BOARD_DELIVERY_STATE_CONFLICT";
        if (!sameTask(task, stored, task.revision())) return "BOARD_DELIVERY_TASK_STALE";
        if (!passed(stored.verification())) return "BOARD_DELIVERY_VERIFICATION_REQUIRED";
        var execution = executions.find(executionId).orElseThrow();
        if (!execution.status().equals("SUCCEEDED") || execution.unconfirmedReason()!=null) return "BOARD_DELIVERY_RUN_NOT_SUCCEEDED";
        if (tasks.hasActiveWorkspace(execution.workspacePath())) return "BOARD_VERIFICATION_WORKSPACE_BUSY";
        return "";
    }
    private static boolean sameTask(BoardTaskService.Task task, Stored stored, long revision) {
        var snapshot = stored.task();
        return stored.revision()==revision && task.title().equals(snapshot.title()) && task.goal().equals(snapshot.goal()) && task.acceptanceCriteria().equals(snapshot.acceptanceCriteria()) && Objects.equals(task.prototypeVersionId(), snapshot.prototype()==null ? null : snapshot.prototype().id());
    }
    private static boolean passed(BoardVerificationService.Record value) {
        return value!=null && value.status().equals("PASSED") && value.plan()!=null && value.sourceAfter()!=null && value.plan().source().equals(value.sourceAfter()) && value.finishedAt()!=null && value.checks().size()==3 && value.checks().stream().allMatch(check -> check.status().equals("PASSED") && check.processTreeCleanup() && Integer.valueOf(0).equals(check.exitCode()));
    }
    private void requireBound(UUID id, String workspace) {
        var available = git.availability(); var execution = executions.find(id).orElseThrow();
        if (!available.allowed()) throw denied(available.reason());
        if (!workspace.equals(available.workspacePath()) || !workspace.equals(execution.workspacePath()) || capability()==null || !execution.executable().equals(capability().executable())) throw denied("BOARD_WORKSPACE_CHANGED");
    }
    private GitCapability capability() { return registry.all().stream().filter(item -> item instanceof GitCapability && item.name().equals("git-status")).map(item -> (GitCapability)item).findFirst().orElse(null); }
    private Stored read(UUID task, UUID execution) {
        var rows = jdbc.query("SELECT delivery_snapshot,delivery_request_hash,delivery_decision_hash,task_revision,task_snapshot,verification_snapshot FROM eap.board_task_run WHERE task_id=? AND execution_id=?", (rs,n) -> new Stored(rs.getString(1)==null ? null : JSON.readValue(rs.getString(1), Delivery.class), rs.getString(2), rs.getString(3), rs.getLong(4), JSON.readValue(rs.getString(5), BoardRunService.Snapshot.class), rs.getString(6)==null ? null : JSON.readValue(rs.getString(6), BoardVerificationService.Record.class)), task, execution);
        if (rows.isEmpty()) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,"BOARD_RUN_NOT_FOUND");
        return rows.getFirst();
    }
    private static String fingerprint(Object value) { return GitReviewCapture.hash(JSON.writeValueAsString(value)); }
    private static void project(String value) { if (value==null || value.isBlank() || value.length()>120) throw new IllegalArgumentException("INVALID_BOARD_FIELD"); }
    private static void text(String value) { if (value==null || value.length()>4000) throw new IllegalArgumentException("INVALID_BOARD_DELIVERY_REQUEST"); }
}
