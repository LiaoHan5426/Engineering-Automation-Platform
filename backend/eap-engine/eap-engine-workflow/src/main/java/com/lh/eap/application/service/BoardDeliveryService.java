package com.lh.eap.application.service;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.lh.eap.api.TaskRef;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import com.lh.eap.error.BoardErrors;
import com.lh.eap.error.BoardDeliveryErrors;
import com.lh.eap.error.BoardVerificationErrors;

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
                          @JsonInclude(JsonInclude.Include.NON_NULL) ApplicationRef applicationRef) {
        public Request(String projectId, long revision, String workspacePath, UUID requestId, List<String> paths, String note) {
            this(projectId, revision, workspacePath, requestId, paths, note, null);
        }
    }
    public record Decide(String projectId, long revision, UUID requestId, UUID deliveryId, String decision, boolean criteriaConfirmed, boolean previewConfirmed, String comment, String previewUrl) {}
    public record Decision(UUID id, UUID requestId, String decision, boolean criteriaConfirmed, boolean previewConfirmed, String comment, String operator, Instant createdAt, String previewUrl) {}
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
                new TaskRef(task.projectId(), task.id(), saved.revision()), execution.workspacePath());
    }
    public Page get(UUID taskId, UUID executionId, String projectId) {
        project(projectId); var task = tasks.find(taskId, projectId, false); var saved = read(taskId, executionId);
        if (saved.delivery()!=null) return new Page(saved.delivery(), false, BoardDeliveryErrors.BOARD_DELIVERY_ALREADY_RECORDED.code());
        String reason = reason(task, saved, executionId);
        return new Page(null, reason.isEmpty(), reason);
    }
    public Delivery submit(UUID taskId, UUID executionId, Request request) {
        project(request.projectId()); BoardDeliveryCapture.validatePaths(request.paths()); text(request.note());
        if (request.revision()<1 || request.requestId()==null || request.workspacePath()==null || request.workspacePath().isBlank() || request.workspacePath().length()>2048) throw new IllegalArgumentException(BoardDeliveryErrors.INVALID_BOARD_DELIVERY_REQUEST.code());
        if (request.applicationRef()!=null && (request.applicationRef().conversationId()==null || request.applicationRef().proposalId()==null)) throw new IllegalArgumentException(BoardDeliveryErrors.INVALID_BOARD_DELIVERY_REQUEST.code());
        String fingerprint = fingerprint(request);
        return verification.observePreflight(taskId, executionId, request.workspacePath(), () -> {
            var task = tasks.find(taskId, request.projectId(), true); var stored = read(taskId, executionId);
            if (stored.delivery()!=null) {
                if (!fingerprint.equals(stored.requestHash())) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_REQUEST_CONFLICT.code());
                return stored.delivery();
            }
            if (task.revision()!=request.revision()) throw denied(BoardErrors.BOARD_REVISION_CONFLICT.code());
            String denial = reason(task, stored, executionId); if (!denial.isEmpty()) throw denied(denial);
            var record = stored.verification(); var plan = record.plan();
            if (!plan.workspacePath().equals(request.workspacePath())) throw denied(BoardErrors.BOARD_WORKSPACE_CHANGED.code());
            lock(task, request.workspacePath()); requireBound(executionId, request.workspacePath());
            var files = captureFiles(request.applicationRef(),request.workspacePath(),stored,request.paths());
            var now = Instant.now();
            var evidence = request.applicationRef()==null ? null : applicationEvidence(request.applicationRef(), request.workspacePath(), stored, files, now, task);
            var delivery = new Delivery(UUID.randomUUID(), evidence==null ? BoardDeliverySource.EXTERNAL_MANUAL.wire() : "PREBOUND".equals(evidence.association()) ? BoardDeliverySource.CHAT_APPLIED_PREBOUND.wire() : BoardDeliverySource.CHAT_APPLIED_POST_HOC.wire(), request.requestId(), task.revision(), task.revision()+1, request.workspacePath(), plan.baseCommit(), record.id(), plan.source().contentHash(), task.prototypeVersionId(), task.goal(), task.acceptanceCriteria(), SensitiveData.redact(request.note()), files, now, null, evidence);
            jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=?::jsonb,delivery_request_hash=? WHERE task_id=? AND execution_id=?", JSON.writeValueAsString(delivery), fingerprint, taskId, executionId);
            tasks.deliveryTransition(task, BoardTaskColumn.ACCEPTANCE.wire()); return delivery;
        });
    }
    public Delivery decide(UUID taskId, UUID executionId, Decide request) {
        project(request.projectId()); text(request.comment());
        if (request.previewUrl()==null || (!request.previewUrl().isEmpty() && !validPreviewUrl(request.previewUrl())) ||
                (BoardDeliveryDecision.ACCEPT.wire().equals(request.decision()) && !validPreviewUrl(request.previewUrl())))
            throw new IllegalArgumentException(BoardDeliveryErrors.INVALID_BOARD_DELIVERY_DECISION.code());
        if (request.revision()<1 || request.requestId()==null || request.deliveryId()==null || request.decision()==null || !Set.of(BoardDeliveryDecision.ACCEPT.wire(),BoardDeliveryDecision.REJECT.wire()).contains(request.decision()) || (request.decision().equals(BoardDeliveryDecision.ACCEPT.wire()) && (!request.criteriaConfirmed() || !request.previewConfirmed())) || (request.decision().equals(BoardDeliveryDecision.REJECT.wire()) && request.comment().isBlank())) throw new IllegalArgumentException(BoardDeliveryErrors.INVALID_BOARD_DELIVERY_DECISION.code());
        // No process in this initial read. Task is re-read and locked inside the independent transaction.
        tasks.find(taskId, request.projectId(), false); var initial = read(taskId, executionId);
        if (initial.delivery()==null) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_REQUIRED.code());
        return verification.observePreflight(taskId, executionId, initial.delivery().workspacePath(), () -> {
            var task = tasks.find(taskId, request.projectId(), true); var stored = read(taskId, executionId); var delivery = stored.delivery();
            if (!delivery.id().equals(request.deliveryId())) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_REQUEST_CONFLICT.code());
            if (delivery.decision()!=null) {
                if (!fingerprint(request).equals(stored.decisionHash())) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_REQUEST_CONFLICT.code());
                return delivery;
            }
            if (task.revision()!=request.revision() || task.revision()!=delivery.submittedRevision()) throw denied(BoardErrors.BOARD_REVISION_CONFLICT.code());
            if (!task.column().equals(BoardTaskColumn.ACCEPTANCE.wire())) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_STATE_CONFLICT.code());
            lock(task, delivery.workspacePath());
            if (request.decision().equals(BoardDeliveryDecision.ACCEPT.wire())) {
                requireBound(executionId, delivery.workspacePath());
                if (!sameTask(task, stored, delivery.taskRevision()) || !passed(stored.verification()) || !stored.verification().id().equals(delivery.verificationId()) || !stored.verification().plan().baseCommit().equals(delivery.baseCommit()) || !stored.verification().plan().source().contentHash().equals(delivery.sourceHash()) || delivery.files().isEmpty()) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_STALE.code());
                var currentFiles = captureFiles(delivery.applicationEvidence()==null?null:new ApplicationRef(delivery.applicationEvidence().conversationId(),delivery.applicationEvidence().proposalId()),delivery.workspacePath(),stored,delivery.files().stream().map(BoardDeliveryCapture.File::path).toList());
                if (!currentFiles.equals(delivery.files())) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_STALE.code());
                if (Set.of(BoardDeliverySource.CHAT_APPLIED_POST_HOC.wire(), BoardDeliverySource.CHAT_APPLIED_PREBOUND.wire()).contains(delivery.source())) {
                    var evidence = delivery.applicationEvidence();
                    if (evidence==null || !evidence.equals(applicationEvidence(new ApplicationRef(evidence.conversationId(), evidence.proposalId()), delivery.workspacePath(), stored, currentFiles, evidence.associatedAt(), task)))
                        throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_STALE.code());
                }
            }
            var decision = new Decision(UUID.randomUUID(), request.requestId(), request.decision(), request.criteriaConfirmed(), request.previewConfirmed(), SensitiveData.redact(request.comment()), "local-operator", Instant.now(), request.previewUrl());
            var result = new Delivery(delivery.id(), delivery.source(), delivery.requestId(), delivery.taskRevision(), delivery.submittedRevision(), delivery.workspacePath(), delivery.baseCommit(), delivery.verificationId(), delivery.sourceHash(), delivery.prototypeVersionId(), delivery.goal(), delivery.acceptanceCriteria(), delivery.note(), delivery.files(), delivery.createdAt(), decision, delivery.applicationEvidence());
            jdbc.update("UPDATE eap.board_task_run SET delivery_snapshot=?::jsonb,delivery_decision_hash=? WHERE task_id=? AND execution_id=?", JSON.writeValueAsString(result), fingerprint(request), taskId, executionId);
            tasks.deliveryTransition(task, request.decision().equals(BoardDeliveryDecision.ACCEPT.wire()) ? BoardTaskColumn.DONE.wire() : BoardTaskColumn.READY.wire()); return result;
        });
    }
    private List<BoardDeliveryCapture.File> captureFiles(ApplicationRef ref,String workspace,Stored stored,List<String> paths) {
        if(ref==null) return capture.capture(Path.of(workspace),capability(),stored.verification().plan().baseCommit(),stored.verification().plan().source(),paths);
        if(applications==null) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_UNAVAILABLE.code());
        return applications.capture(ref,workspace,stored.verification(),paths,capture,capability());
    }
    private BoardApplicationEvidence.Evidence applicationEvidence(ApplicationRef ref, String workspace, Stored stored, List<BoardDeliveryCapture.File> files, Instant at, BoardTaskService.Task task) {
        if (applications==null) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_UNAVAILABLE.code());
        // Run revision is the original delivery revision, not the post-submit current task revision.
        return applications.associate(ref, workspace, stored.task().prototype(), stored.verification(), files, at,
                new TaskRef(task.projectId(), task.id(), stored.revision()), stored.task());
    }
    private void lock(BoardTaskService.Task task, String workspace) {
        if (tasks.hasActiveExecution(task.id())) throw denied(BoardErrors.BOARD_EXECUTION_ACTIVE.code());
        tasks.lockWorkspace(workspace);
        if (tasks.hasActiveWorkspace(workspace)) throw denied(BoardVerificationErrors.BOARD_VERIFICATION_WORKSPACE_BUSY.code());
    }
    private String reason(BoardTaskService.Task task, Stored stored, UUID executionId) {
        if (task.executionActive()) return BoardErrors.BOARD_EXECUTION_ACTIVE.code();
        if (!task.column().equals(BoardTaskColumn.READY.wire())) return BoardDeliveryErrors.BOARD_DELIVERY_STATE_CONFLICT.code();
        if (!sameTask(task, stored, task.revision())) return BoardDeliveryErrors.BOARD_DELIVERY_TASK_STALE.code();
        if (!passed(stored.verification())) return BoardDeliveryErrors.BOARD_DELIVERY_VERIFICATION_REQUIRED.code();
        var execution = executions.find(executionId).orElseThrow();
        if (!execution.status().equals(MissionExecutionStatus.SUCCEEDED.wire()) || execution.unconfirmedReason()!=null) return BoardDeliveryErrors.BOARD_DELIVERY_RUN_NOT_SUCCEEDED.code();
        if (tasks.hasActiveWorkspace(execution.workspacePath())) return BoardVerificationErrors.BOARD_VERIFICATION_WORKSPACE_BUSY.code();
        return "";
    }
    private static boolean sameTask(BoardTaskService.Task task, Stored stored, long revision) {
        var snapshot = stored.task();
        return stored.revision()==revision && task.title().equals(snapshot.title()) && task.goal().equals(snapshot.goal()) && task.acceptanceCriteria().equals(snapshot.acceptanceCriteria()) && Objects.equals(task.prototypeVersionId(), snapshot.prototype()==null ? null : snapshot.prototype().id());
    }
    private static boolean passed(BoardVerificationService.Record value) {
        return value!=null && value.status().equals(BoardVerificationStatus.PASSED.wire()) && value.plan()!=null && value.sourceAfter()!=null && value.plan().source().equals(value.sourceAfter()) && value.finishedAt()!=null && value.checks().size()==3 && value.checks().stream().allMatch(check -> check.status().equals(BoardVerificationCheckStatus.PASSED.wire()) && check.processTreeCleanup() && Integer.valueOf(0).equals(check.exitCode()));
    }
    private void requireBound(UUID id, String workspace) {
        var available = git.availability(); var execution = executions.find(id).orElseThrow();
        if (!available.allowed()) throw denied(available.reason());
        if (!workspace.equals(available.workspacePath()) || !workspace.equals(execution.workspacePath()) || capability()==null || !execution.executable().equals(capability().executable())) throw denied(BoardErrors.BOARD_WORKSPACE_CHANGED.code());
    }
    private GitCapability capability() { return registry.all().stream().filter(item -> item instanceof GitCapability && item.name().equals("git-status")).map(item -> (GitCapability)item).findFirst().orElse(null); }
    private Stored read(UUID task, UUID execution) {
        var rows = jdbc.query("SELECT delivery_snapshot,delivery_request_hash,delivery_decision_hash,task_revision,task_snapshot,verification_snapshot FROM eap.board_task_run WHERE task_id=? AND execution_id=?", (rs,n) -> new Stored(rs.getString(1)==null ? null : JSON.readValue(rs.getString(1), Delivery.class), rs.getString(2), rs.getString(3), rs.getLong(4), JSON.readValue(rs.getString(5), BoardRunService.Snapshot.class), rs.getString(6)==null ? null : JSON.readValue(rs.getString(6), BoardVerificationService.Record.class)), task, execution);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,BoardErrors.BOARD_RUN_NOT_FOUND.code());
        return rows.getFirst();
    }
    private static String fingerprint(Object value) { return GitReviewCapture.hash(JSON.writeValueAsString(value)); }
    static boolean validPreviewUrl(String value) {
        if (value==null || value.length()>2048 || value.chars().anyMatch(Character::isWhitespace) || value.chars().anyMatch(Character::isISOControl)) return false;
        try {
            var url = java.net.URI.create(value);
            return url.getScheme()!=null && Set.of("http", "https").contains(url.getScheme()) && url.getHost()!=null &&
                    Set.of("localhost", "127.0.0.1", "[::1]").contains(url.getHost()) && url.getRawUserInfo()==null &&
                    (url.getPort()==-1 || url.getPort()>0 && url.getPort()<=65535);
        } catch (IllegalArgumentException invalid) { return false; }
    }
    private static void project(String value) { if (value==null || value.isBlank() || value.length()>120) throw new IllegalArgumentException(BoardErrors.INVALID_BOARD_FIELD.code()); }
    private static void text(String value) { if (value==null || value.length()>4000) throw new IllegalArgumentException(BoardDeliveryErrors.INVALID_BOARD_DELIVERY_REQUEST.code()); }
}
