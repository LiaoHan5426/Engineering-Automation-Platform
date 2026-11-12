package com.lh.eap.application.service;

import com.lh.eap.api.ProcessExecutor;
import com.lh.eap.capability.GitCapability;
import com.lh.eap.common.SensitiveData;
import com.lh.eap.core.CapabilityRegistry;
import com.lh.eap.delivery.CodeChangeService;
import com.lh.eap.error.BoardDeliveryErrors;
import com.lh.eap.error.BoardErrors;
import java.nio.file.Path;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import static com.lh.eap.application.service.BoardVerificationSource.denied;

/** Durable full frontend write-before evidence, captured only by the locked claim. */
@Service
public class BoardApplicationBaseline {
    public record Baseline(String workspacePath, String baseCommit, BoardVerificationSource.Source source, Instant capturedAt) {}
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final ProcessExecutor executor;
    private final CapabilityRegistry registry;
    private final BoardVerificationSource sources;
    public BoardApplicationBaseline(JdbcTemplate jdbc, ProcessExecutor executor, CapabilityRegistry registry, BoardVerificationSource sources) {
        this.jdbc=jdbc; this.executor=executor; this.registry=registry; this.sources=sources;
    }
    public Baseline capture(CodeChangeService.Proposal proposal) {
        // Other code application purposes remain outside frontend delivery coverage.
        if (proposal.files().stream().noneMatch(file -> BoardVerificationSource.sourcePath(file.path()))) return null;
        BoardDeliveryCapture.validatePaths(proposal.files().stream().map(CodeChangeService.Change::path).toList());
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(65);
        Path root=Path.of(proposal.workspace());
        var git=registry.all().stream().filter(item -> item instanceof GitCapability && item.name().equals("git-status"))
                .map(item -> (GitCapability)item).findFirst().orElseThrow(() -> denied(BoardErrors.BOARD_WORKSPACE_CHANGED.code()));
        root(root, git, deadline);
        String head=invoke(root,git.reviewCommand("head",null,Set.of()),deadline).strip();
        if (!head.matches("[a-f0-9]{40}|[a-f0-9]{64}")) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_INCOMPLETE.code());
        budget(deadline,10);
        var source=sources.snapshot(root);
        for(var change:proposal.files()) {
            var file=source.files().stream().filter(value -> value.path().equals(change.path())).findFirst();
            String hash=file.map(BoardVerificationSource.File::contentHash).orElse("absent");
            if (!hash.equals(change.baseHash()) || !hash.equals(change.before()==null?"absent":GitReviewCapture.hash(change.before())))
                throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_SOURCE_MISMATCH.code());
        }
        if (!head.equals(invoke(root,git.reviewCommand("head-after",null,Set.of()),deadline).strip())) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_SOURCE_STALE.code());
        root(root,git,deadline);
        budget(deadline,0);
        return new Baseline(proposal.workspace(),head,source,Instant.now());
    }
    public Baseline required(String principal, UUID conversation, UUID proposal, String workspace) {
        var rows=jdbc.query("SELECT application_baseline FROM eap.code_proposal WHERE principal=? AND conversation_id=? AND id=? AND workspace=?",
                (rs,n)->Optional.ofNullable(rs.getString(1)),principal,conversation,proposal,workspace);
        if(rows.isEmpty()) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_NOT_FOUND.code());
        if(rows.getFirst().isEmpty()) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_BASELINE_REQUIRED.code());
        var baseline=JSON.readValue(rows.getFirst().orElseThrow(),Baseline.class);
        if(!workspace.equals(baseline.workspacePath()) || baseline.source()==null || baseline.capturedAt()==null)
            throw denied(BoardDeliveryErrors.BOARD_DELIVERY_APPLICATION_BASELINE_REQUIRED.code());
        return baseline;
    }
    private void root(Path root, GitCapability git,long deadline) {
        String reported=invoke(root,git.reviewCommand("root",null,Set.of()),deadline).strip();
        try { if(!root.toRealPath().equals(Path.of(reported).toRealPath())) throw denied(BoardErrors.BOARD_WORKSPACE_CHANGED.code()); }
        catch(java.io.IOException failure) { throw denied(BoardErrors.BOARD_WORKSPACE_CHANGED.code()); }
    }
    private static void budget(long deadline,int seconds) {
        if(System.nanoTime()+TimeUnit.SECONDS.toNanos(seconds)>=deadline) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_LIMIT.code());
    }
    private String invoke(Path root,List<String> command,long deadline) {
        // Shared deadline reserves the existing executor's worst-case 20 seconds before every call.
        budget(deadline,20);
        var result=executor.runIsolated("git-status",root,command,GitCapability.environment());
        budget(deadline,0);
        if(!result.success() || result.exitCode()!=0 || !Boolean.TRUE.equals(result.metadata().get("processExited"))
                || !Boolean.TRUE.equals(result.metadata().get("processTreeCleanup")) || Boolean.TRUE.equals(result.metadata().get("truncated"))
                || !result.stdout().equals(SensitiveData.redact(result.stdout()))) throw denied(BoardDeliveryErrors.BOARD_DELIVERY_INCOMPLETE.code());
        return result.stdout();
    }
}
