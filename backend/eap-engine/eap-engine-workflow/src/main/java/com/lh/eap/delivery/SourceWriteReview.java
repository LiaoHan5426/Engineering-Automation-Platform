package com.lh.eap.delivery;

import com.lh.eap.common.SensitiveData;
import com.lh.eap.config.RuntimeWorkspace;
import com.lh.eap.error.CodeErrors;
import com.lh.eap.error.WorkspaceErrors;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Workspace-scoped recovery of the original durable intent. No source writes or delivery evidence. */
@Service
public final class SourceWriteReview {
    public enum FileMatch { BASELINE, CANDIDATE, BOTH, DIFFERENT }
    public record Item(UUID id, String status, String reason, Instant startedAt) {}
    public record FileEvidence(String path, String baselineHash, String candidateHash, String currentHash, FileMatch match) {}
    public record Observation(List<FileEvidence> files, String digest) {}
    public record Resolution(UUID requestId, String operator, Instant closedAt, String note, Observation observation) {}
    public record Detail(Item item, String workspace, Observation observation, Resolution resolution) {}
    public record Close(UUID requestId, String digest, String note, boolean confirmed) {}

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final int MAX_BYTES = 640000;
    private final RuntimeWorkspace runtime;
    private final CodeChangeService changes;
    private final JdbcCodeProposalStore proposals;

    public SourceWriteReview(RuntimeWorkspace runtime, CodeChangeService changes, JdbcCodeProposalStore proposals) {
        this.runtime = runtime;
        this.changes = changes;
        this.proposals = proposals;
    }

    public List<Item> list() {
        return proposals.reviewItems(RuntimeWorkspace.OPERATOR_LABEL, workspace());
    }

    public Detail inspect(UUID id) {
        String workspace = workspace();
        var row = row(workspace, id);
        if (row.resolution() != null) return closed(row, workspace);
        requireUnknown(row);
        return new Detail(row.item(), workspace, observe(row.proposal(), workspace), null);
    }

    public Detail close(UUID id, Close input) {
        if (input == null || input.requestId() == null || !input.confirmed()
                || input.digest() == null || !input.digest().matches("[0-9a-f]{64}")
                || input.note() == null || input.note().isBlank() || input.note().length() > 2000
                || input.note().indexOf(0) >= 0 || SensitiveData.containsSecret(input.note()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, CodeErrors.INVALID_CODE_REVIEW.code());
        String workspace = workspace();
        return proposals.reviewLocked(workspace, () -> {
            var row = row(workspace, id);
            if (row.resolution() != null) {
                var saved = row.resolution();
                if (saved.requestId().equals(input.requestId()) && saved.observation().digest().equals(input.digest())
                        && saved.note().equals(input.note().strip())) return closed(row, workspace);
                throw conflict(CodeErrors.CODE_REVIEW_CONFLICT);
            }
            requireUnknown(row);
            var observation = observe(row.proposal(), workspace);
            if (!observation.digest().equals(input.digest())) throw conflict(CodeErrors.CODE_REVIEW_CHANGED);
            var resolution = new Resolution(input.requestId(), RuntimeWorkspace.OPERATOR_LABEL,
                    Instant.now(), input.note().strip(), observation);
            proposals.closeUnknown(RuntimeWorkspace.OPERATOR_LABEL, workspace, id, resolution);
            return closed(row(workspace, id), workspace);
        });
    }

    private JdbcCodeProposalStore.ReviewRow row(String workspace, UUID id) {
        return proposals.reviewRow(RuntimeWorkspace.OPERATOR_LABEL, workspace, id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, CodeErrors.UNKNOWN_CODE_PROPOSAL.code()));
    }

    private static Detail closed(JdbcCodeProposalStore.ReviewRow row, String workspace) {
        return new Detail(row.item(), workspace, row.resolution().observation(), row.resolution());
    }

    private static void requireUnknown(JdbcCodeProposalStore.ReviewRow row) {
        if (!CodeProposalStatus.UNKNOWN.wire().equals(row.item().status())) throw conflict(CodeErrors.CODE_REVIEW_NOT_UNKNOWN);
    }

    private String workspace() {
        try {
            Path workspace = runtime.workspace().toRealPath();
            var root = runtime.root();
            if (root.allowed() && workspace.startsWith(root.path().toRealPath())) return workspace.toString();
        } catch (IOException ignored) {
            // Missing workspace or grant fails closed.
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN, WorkspaceErrors.WORKSPACE_WRITE_NOT_AUTHORIZED.code());
    }

    private Observation observe(CodeChangeService.Proposal proposal, String workspace) {
        if (!workspace.equals(workspace()) || !workspace.equals(proposal.workspace())) throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
        var files = proposal.files().stream().map(change -> evidence(change, workspace)).toList();
        if (!workspace.equals(workspace())) throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
        return new Observation(files, CodeChangeService.hash(JSON.writeValueAsString(List.of(proposal.id(), files))));
    }

    private FileEvidence evidence(CodeChangeService.Change change, String workspace) {
        try {
            Path path = reviewTarget(change.path());
            if (!path.startsWith(Path.of(workspace))) throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
            String current = currentHash(path);
            if (!path.equals(reviewTarget(change.path()))) throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
            String candidate = CodeChangeService.hash(change.content());
            boolean baselineMatch = current.equals(change.baseHash());
            boolean candidateMatch = current.equals(candidate);
            var match = baselineMatch ? (candidateMatch ? FileMatch.BOTH : FileMatch.BASELINE)
                    : (candidateMatch ? FileMatch.CANDIDATE : FileMatch.DIFFERENT);
            return new FileEvidence(change.path(), change.baseHash(), candidate, current, match);
        } catch (IOException | SecurityException unavailable) {
            throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
        }
    }

    private Path reviewTarget(String path) throws IOException {
        try {
            return changes.target(path, true);
        } catch (ResponseStatusException unavailable) {
            throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
        }
    }

    private static String currentHash(Path path) throws IOException {
        BasicFileAttributes before;
        try {
            before = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        } catch (NoSuchFileException absent) {
            return "absent";
        }
        if (!before.isRegularFile() || before.size() > MAX_BYTES) throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
        byte[] bytes;
        try (var input = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) {
            bytes = input.readNBytes(MAX_BYTES + 1);
        }
        var after = Files.readAttributes(path, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
        if (!after.isRegularFile() || bytes.length > MAX_BYTES || bytes.length != before.size()
                || before.size() != after.size() || !before.lastModifiedTime().equals(after.lastModifiedTime())
                || !java.util.Objects.equals(before.fileKey(), after.fileKey()))
            throw conflict(CodeErrors.CODE_REVIEW_UNAVAILABLE);
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static ResponseStatusException conflict(CodeErrors code) {
        return new ResponseStatusException(HttpStatus.CONFLICT, code.code());
    }
}
