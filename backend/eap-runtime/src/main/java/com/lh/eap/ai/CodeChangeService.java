package com.lh.eap.ai;

import com.lh.eap.config.RuntimeWorkspace;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

/** Small review-and-save boundary. No shell, agent loop, scheduling, or automatic execution. */
@Service
public final class CodeChangeService {
    public record Change(String path, String before, String content, String baseHash) {}
    public record Proposal(UUID id, UUID conversationId, String workspace, String summary, List<Change> files, Instant createdAt,
                           boolean applied, boolean writeAllowed, String verification) {}
    public record Applied(UUID id, List<String> written, String verification) {}
    private final RuntimeWorkspace runtime;
    private final Map<UUID, Proposal> proposals = new LinkedHashMap<>();
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> EXTENSIONS = Set.of("vue", "ts", "tsx", "js", "jsx", "css", "html", "json", "md", "sql", "java");
    public CodeChangeService(RuntimeWorkspace runtime) { this.runtime = runtime; }

    public synchronized Proposal propose(UUID conversation, String answer) {
        return propose(conversation, answer, true);
    }

    public synchronized Proposal propose(UUID conversation, String answer, boolean writeAllowed) {
        try {
            String value = answer.strip();
            if (value.startsWith("```")) value = value.substring(value.indexOf('\n') + 1, value.lastIndexOf("```")).strip();
            var root = JSON.readTree(value);
            var entries = root.path("files");
            if (!entries.isArray() || entries.size() < 1 || entries.size() > 8) throw rejected("INVALID_CODE_PROPOSAL");
            var files = new ArrayList<Change>();
            var names = new HashSet<String>();
            int total = 0;
            for (var entry : entries) {
                String name = entry.path("path").asString(""), content = entry.path("content").asString("");
                if (!entry.path("content").isString() || !names.add(name)) throw rejected("INVALID_CODE_PROPOSAL");
                total += content.length();
                if (total > 160000) throw rejected("CODE_PROPOSAL_TOO_LARGE");
                Path path = target(name, false);
                if (Files.exists(path) && Files.size(path) > 640000) throw rejected("EXISTING_FILE_TOO_LARGE");
                String before = Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
                if (before != null && before.length() > 160000) throw rejected("EXISTING_FILE_TOO_LARGE");
                files.add(new Change(name, before, content, hash(before)));
            }
            var proposal = new Proposal(UUID.randomUUID(), conversation, runtime.workspace().toRealPath().toString(), root.path("summary").asString(""),
                    List.copyOf(files), Instant.now(), false, writeAllowed, "not_requested");
            sweep();
            if (proposals.size() >= 32) proposals.remove(proposals.keySet().iterator().next());
            proposals.put(proposal.id(), proposal);
            return proposal;
        } catch (ResponseStatusException expected) { throw expected; }
        catch (Exception invalid) { throw rejected("INVALID_CODE_PROPOSAL"); }
    }

    public synchronized Applied apply(UUID conversation, UUID id, boolean confirmed) {
        if (!confirmed) throw rejected("WRITE_CONFIRMATION_REQUIRED");
        sweep();
        var proposal = proposals.get(id);
        if (proposal == null || !proposal.conversationId().equals(conversation)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_CODE_PROPOSAL");
        if (!proposal.writeAllowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "READ_ONLY_PROPOSAL");
        if (proposal.applied()) return new Applied(id, proposal.files().stream().map(Change::path).toList(), "not_requested");
        var written = new ArrayList<String>();
        try {
            // Check every base before the first write. User changes since generation must be reviewed again.
            for (var file : proposal.files()) {
                Path path = target(file.path(), true);
                if (!runtime.workspace().toRealPath().toString().equals(proposal.workspace())) throw rejected("WORKSPACE_CHANGED");
                String current = Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
                if (!hash(current).equals(file.baseHash())) throw new ResponseStatusException(HttpStatus.CONFLICT, "FILE_CHANGED_SINCE_PROPOSAL");
            }
            for (var file : proposal.files()) {
                Path path = target(file.path(), true);
                String current = Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
                if (!hash(current).equals(file.baseHash())) throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "FILE_CHANGED_SINCE_PROPOSAL; written=" + String.join(",", written));
                Files.createDirectories(path.getParent());
                Path temp = Files.createTempFile(path.getParent(), ".eap-code-", ".tmp");
                try {
                    Files.writeString(temp, file.content(), StandardCharsets.UTF_8);
                    if (file.before() == null) Files.move(temp, path); // never overwrite a concurrently created file
                    else Files.move(temp, path, StandardCopyOption.REPLACE_EXISTING);
                    written.add(file.path());
                } finally { Files.deleteIfExists(temp); }
            }
            proposals.put(id, new Proposal(proposal.id(), conversation, proposal.workspace(), proposal.summary(), proposal.files(), proposal.createdAt(), true, true, "not_requested"));
            return new Applied(id, List.copyOf(written), "not_requested");
        } catch (ResponseStatusException failure) { throw failure; }
        catch (IOException failure) {
            // Do not claim transactional filesystem writes or roll back user files blindly.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CODE_WRITE_FAILED; written=" + String.join(",", written));
        }
    }

    private Path target(String relative, boolean writing) throws IOException {
        if (relative.isBlank() || relative.length() > 240 || relative.contains("\\") || relative.contains(":")) throw rejected("INVALID_CODE_PATH");
        var parts = relative.split("/", -1);
        for (String part : parts) if (part.isBlank() || part.startsWith(".") || part.equals("node_modules") || part.equals("target") || part.equals("dist")) throw rejected("INVALID_CODE_PATH");
        String extension = relative.substring(relative.lastIndexOf('.') + 1);
        if (!EXTENSIONS.contains(extension) || relative.endsWith("package.json") || relative.endsWith("pom.xml")) throw rejected("SOURCE_FILES_ONLY");
        Path workspace = runtime.workspace().toRealPath();
        if (writing && (!runtime.root().allowed() || !workspace.startsWith(runtime.root().path())))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "WORKSPACE_WRITE_NOT_AUTHORIZED");
        Path candidate = workspace;
        for (String part : parts) {
            candidate = candidate.resolve(part);
            if (Files.isSymbolicLink(candidate) || (Files.exists(candidate) && !candidate.toRealPath().startsWith(workspace))) throw rejected("CODE_PATH_ESCAPES_WORKSPACE");
        }
        if (Files.exists(candidate) && !Files.isRegularFile(candidate)) throw rejected("INVALID_CODE_PATH");
        return candidate;
    }
    private void sweep() { proposals.values().removeIf(item -> item.createdAt().isBefore(Instant.now().minusSeconds(1800))); }
    private static String hash(String value) {
        if (value == null) return "absent";
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
    private static ResponseStatusException rejected(String code) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, code); }
}
