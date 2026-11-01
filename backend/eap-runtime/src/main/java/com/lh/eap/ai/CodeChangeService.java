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
    public record Generation(UUID id, String targetPath, String baseHash, Instant capturedAt,
                             String prototypeVersionId, String prototypeContentHash) {}
    public record Proposal(UUID id, UUID conversationId, String workspace, String summary, List<Change> files, Instant createdAt,
                           boolean applied, boolean writeAllowed, String verification, Generation generation) {
        public Proposal(UUID id, UUID conversationId, String workspace, String summary, List<Change> files, Instant createdAt,
                        boolean applied, boolean writeAllowed, String verification) {
            this(id, conversationId, workspace, summary, files, createdAt, applied, writeAllowed, verification, null);
        }
    }
    public record Applied(UUID id, List<String> written, String verification, List<CodeVerificationService.Check> checks) {}
    /** Read-only snapshot for delivery gates. Does not return file contents. */
    public record Baseline(String path, boolean exists, String baseHash, String denial) {}
    /**
     * Read-only generation-prep excerpt. Does not grant write authorization.
     * @param excerpt truncated UTF-8 text for UI/model binding; empty when denied or missing
     */
    public record SourceExcerpt(String path, boolean exists, String baseHash, int bytes, String excerpt, String denial) {}
    /**
     * Read-only dirty-file summary from {@code git status --porcelain}.
     * {@code requested=false} means the server did not run git (authorization or runner gap).
     */
    public record DirtySummary(boolean requested, String denial, int count, List<String> paths, String detail) {}
    /**
     * Safe verification probe result. {@code requested=false} means the probe did not run
     * (missing root / runner). Never marks apply verification as passed.
     */
    public record VerificationProbe(boolean requested, String denial, String name, Integer exitCode, String summary) {}
    public interface DirtyRunner {
        String porcelain(Path workspace) throws Exception;
    }
    private final RuntimeWorkspace runtime;
    private final CodeVerificationService verification;
    private final DirtyRunner dirtyRunner;
    private final CodeGenerationStore generations;
    private final Map<UUID, Proposal> proposals = new LinkedHashMap<>();
    private final Map<UUID, Applied> appliedResults = new HashMap<>();
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Set<String> EXTENSIONS = Set.of("vue", "ts", "tsx", "js", "jsx", "css", "html", "json", "md", "sql", "java");
    private static final int SOURCE_EXCERPT_LIMIT = 4000;
    static final int MAX_PROPOSAL_CONTENT_CHARS = 160000;
    // JSON can encode each UTF-16 code unit as six characters; reserve bounded envelope space.
    static final int MAX_PROPOSAL_RESPONSE_CHARS = 6 * MAX_PROPOSAL_CONTENT_CHARS + 16384;
    private static final int DIRTY_PATH_LIMIT = 40;
    public CodeChangeService(RuntimeWorkspace runtime) { this(runtime, null, null); }
    public CodeChangeService(RuntimeWorkspace runtime, CodeVerificationService verification) {
        this(runtime, verification, null);
    }
    public CodeChangeService(RuntimeWorkspace runtime,
            @org.springframework.beans.factory.annotation.Autowired(required = false) CodeVerificationService verification,
            DirtyRunner dirtyRunner) {
        this(runtime, verification, dirtyRunner, null);
    }
    @org.springframework.beans.factory.annotation.Autowired
    public CodeChangeService(RuntimeWorkspace runtime,
            @org.springframework.beans.factory.annotation.Autowired(required = false) CodeVerificationService verification,
            DirtyRunner dirtyRunner, CodeGenerationStore generations) {
        this.runtime = runtime;
        this.verification = verification;
        this.generations = generations;
        // Compatibility constructors have no execution authority. Production requires the shared runner.
        this.dirtyRunner = dirtyRunner == null ? workspace -> null : dirtyRunner;
    }

    /**
     * Generation-prep baseline for one workspace-relative source file.
     * Requires an authorized root that covers the workspace; never returns file body.
     */
    public Baseline inspectBaseline(String relative) {
        String path = relative == null ? "" : relative;
        if (!runtime.root().allowed()) {
            String denial = runtime.root().denial();
            return new Baseline(path, false, "", denial == null || denial.isBlank() ? "AUTHORIZED_ROOT_MISSING" : denial);
        }
        try {
            Path file = target(path, false);
            Path authorized = runtime.root().path();
            Path real = Files.exists(file) ? file.toRealPath() : file.toAbsolutePath().normalize();
            if (!real.startsWith(authorized.toRealPath())) {
                return new Baseline(path, false, "", "OUTSIDE_AUTHORIZED_ROOT");
            }
            if (!Files.exists(file)) return new Baseline(path, false, "absent", "");
            if (!Files.isRegularFile(file)) return new Baseline(path, false, "", "INVALID_CODE_PATH");
            if (Files.size(file) > 640000) return new Baseline(path, true, "", "EXISTING_FILE_TOO_LARGE");
            String content = Files.readString(file, StandardCharsets.UTF_8);
            if (content.length() > 160000) return new Baseline(path, true, "", "EXISTING_FILE_TOO_LARGE");
            return new Baseline(path, true, hash(content), "");
        } catch (ResponseStatusException expected) {
            return new Baseline(path, false, "", expected.getReason() == null ? "INVALID_CODE_PATH" : expected.getReason());
        } catch (Exception failure) {
            return new Baseline(path, false, "", "BASELINE_UNAVAILABLE");
        }
    }

    /**
     * Read-only dirty paths under the authorized workspace. Never writes and never widens grants.
     */
    public DirtySummary inspectDirty() {
        if (!runtime.root().allowed()) {
            String denial = runtime.root().denial();
            return new DirtySummary(false, denial == null || denial.isBlank() ? "AUTHORIZED_ROOT_MISSING" : denial, 0, List.of(), "");
        }
        try {
            Path workspace = runtime.workspace().toRealPath();
            Path authorized = runtime.root().path().toRealPath();
            if (!workspace.startsWith(authorized)) {
                return new DirtySummary(false, "OUTSIDE_AUTHORIZED_ROOT", 0, List.of(), "");
            }
            String porcelain = dirtyRunner.porcelain(workspace);
            if (porcelain == null) return new DirtySummary(false, "GIT_STATUS_UNAVAILABLE", 0, List.of(), "");
            var paths = new ArrayList<String>();
            for (String line : porcelain.replace("\r\n", "\n").split("\n")) {
                String entry = dirtyPath(line);
                if (entry.isBlank()) continue;
                if (entry.length() > 240) entry = entry.substring(0, 240);
                paths.add(entry);
                if (paths.size() >= DIRTY_PATH_LIMIT) break;
            }
            return new DirtySummary(true, "", paths.size(), List.copyOf(paths), paths.isEmpty() ? "clean" : "dirty");
        } catch (Exception failure) {
            String detail = failure.getMessage() == null || failure.getMessage().isBlank()
                    ? failure.getClass().getSimpleName()
                    : failure.getMessage();
            if (detail.length() > 120) detail = detail.substring(0, 120);
            return new DirtySummary(false, "GIT_STATUS_FAILED", 0, List.of(), detail);
        }
    }

    /**
     * Safe {@code git --version} probe under the process-bound root.
     * Independent of {@code eap.runtime.verification.enabled}; never runs configured heavy checks.
     */
    public VerificationProbe probeVerification() {
        if (!runtime.root().allowed()) {
            String denial = runtime.root().denial();
            return new VerificationProbe(false,
                    denial == null || denial.isBlank() ? "AUTHORIZED_ROOT_MISSING" : denial,
                    "", null, "");
        }
        if (verification == null) {
            return new VerificationProbe(false, "VERIFICATION_UNAVAILABLE", "", null, "");
        }
        try {
            Path workspace = runtime.workspace().toRealPath();
            Path authorized = runtime.root().path().toRealPath();
            if (!workspace.startsWith(authorized)) {
                return new VerificationProbe(false, "OUTSIDE_AUTHORIZED_ROOT", "", null, "");
            }
            var check = verification.probe(workspace);
            return new VerificationProbe(true, "", check.name(), check.exitCode(), check.summary() == null ? "" : check.summary());
        } catch (Exception failure) {
            String detail = failure.getMessage() == null || failure.getMessage().isBlank()
                    ? failure.getClass().getSimpleName()
                    : failure.getMessage();
            if (detail.length() > 120) detail = detail.substring(0, 120);
            return new VerificationProbe(false, "PROBE_FAILED", "", null, detail);
        }
    }

    /**
     * Read a bounded excerpt from the runtime workspace for generation prep.
     * Does not require authorized-root and never enables writes.
     */
    public SourceExcerpt inspectSource(String relative) {
        String path = relative == null ? "" : relative;
        try {
            Path file = target(path, false);
            if (!Files.exists(file)) return new SourceExcerpt(path, false, "absent", 0, "", "");
            if (!Files.isRegularFile(file)) return new SourceExcerpt(path, false, "", 0, "", "INVALID_CODE_PATH");
            if (Files.size(file) > 640000) return new SourceExcerpt(path, true, "", 0, "", "EXISTING_FILE_TOO_LARGE");
            String content = Files.readString(file, StandardCharsets.UTF_8);
            if (content.length() > 160000) return new SourceExcerpt(path, true, "", content.length(), "", "EXISTING_FILE_TOO_LARGE");
            String excerpt = content.length() <= SOURCE_EXCERPT_LIMIT ? content : content.substring(0, SOURCE_EXCERPT_LIMIT);
            return new SourceExcerpt(path, true, hash(content), content.length(), excerpt, "");
        } catch (ResponseStatusException expected) {
            return new SourceExcerpt(path, false, "", 0, "", expected.getReason() == null ? "INVALID_CODE_PATH" : expected.getReason());
        } catch (Exception failure) {
            return new SourceExcerpt(path, false, "", 0, "", "SOURCE_UNAVAILABLE");
        }
    }

    public synchronized Proposal propose(UUID conversation, String answer) {
        return propose(conversation, answer, true, "");
    }

    public synchronized Proposal propose(UUID conversation, String answer, boolean writeAllowed) {
        return propose(conversation, answer, writeAllowed, "");
    }

    /**
     * Parse a model JSON proposal. When {@code expectedTargetPath} is non-blank (code delivery),
     * the proposal must include that relative path so candidates cannot abandon the bound page shell.
     */
    public synchronized Proposal propose(UUID conversation, String answer, boolean writeAllowed, String expectedTargetPath) {
        return parseProposal(conversation, answer, writeAllowed, expectedTargetPath, null);
    }

    public synchronized Proposal proposePrepared(String principal, UUID conversation, UUID generationId,
                                                String answer, boolean writeAllowed) {
        var snapshot = loadGeneration(generationId);
        if (!snapshot.principal().equals(principal) || !snapshot.conversationId().equals(conversation))
            throw rejected("CODE_GENERATION_SCOPE_MISMATCH");
        verifyGeneration(snapshot);
        return parseProposal(conversation, answer, writeAllowed, snapshot.targetPath(), snapshot);
    }

    private Proposal parseProposal(UUID conversation, String answer, boolean writeAllowed, String expectedTargetPath,
                                   CodeGenerationStore.Snapshot generation) {
        try {
            if (answer.length() > MAX_PROPOSAL_RESPONSE_CHARS) throw rejected("CODE_PROPOSAL_TOO_LARGE");
            String value = answer.strip();
            if (value.startsWith("```")) value = value.substring(value.indexOf('\n') + 1, value.lastIndexOf("```")).strip();
            var root = JSON.readTree(value);
            var entries = root.path("files");
            if (!entries.isArray() || entries.size() < 1 || entries.size() > 8) throw rejected("INVALID_CODE_PROPOSAL");
            if (generation != null && (entries.size() != 1 || !entries.get(0).path("path").asString("").equals(generation.targetPath())))
                throw rejected("CODE_GENERATION_SCOPE_MISMATCH");
            var files = new ArrayList<Change>();
            var names = new HashSet<String>();
            var targets = new ArrayList<Path>();
            int total = 0;
            for (var entry : entries) {
                String name = entry.path("path").asString(""), content = entry.path("content").asString("");
                if (!entry.path("content").isString() || !names.add(name)) throw rejected("INVALID_CODE_PROPOSAL");
                total += content.length();
                if (total > MAX_PROPOSAL_CONTENT_CHARS) throw rejected("CODE_PROPOSAL_TOO_LARGE");
                Path path = target(name, false);
                for (Path previous : targets) {
                    if (previous.equals(path) || (Files.exists(previous) && Files.exists(path) && Files.isSameFile(previous, path))) {
                        throw rejected("INVALID_CODE_PROPOSAL");
                    }
                }
                targets.add(path);
                if (Files.exists(path) && Files.size(path) > 640000) throw rejected("EXISTING_FILE_TOO_LARGE");
                String before = generation != null ? generation.source() : Files.exists(path) ? Files.readString(path, StandardCharsets.UTF_8) : null;
                if (before != null && before.length() > 160000) throw rejected("EXISTING_FILE_TOO_LARGE");
                files.add(new Change(name, before, content, hash(before)));
            }
            String expected = expectedTargetPath == null ? "" : expectedTargetPath.trim();
            if (!expected.isBlank() && !names.contains(expected)) {
                throw rejected("TARGET_PATH_REQUIRED");
            }
            var proposal = new Proposal(UUID.randomUUID(), conversation, runtime.workspace().toRealPath().toString(), root.path("summary").asString(""),
                    List.copyOf(files), Instant.now(), false, writeAllowed, "not_requested", generation == null ? null : generation.reference());
            if (generation != null) verifyGeneration(generation);
            sweep();
            if (proposals.size() >= 32) {
                UUID oldest = proposals.keySet().iterator().next();
                proposals.remove(oldest);
                appliedResults.remove(oldest);
            }
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
        if (proposal.applied()) {
            return appliedResults.get(id);
        }
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
            var checks = verification != null && verification.enabled()
                    ? verification.run(runtime.workspace().toRealPath())
                    : List.<CodeVerificationService.Check>of();
            String status = checks.isEmpty() ? "not_requested" : "requested";
            var result = new Applied(id, List.copyOf(written), status, List.copyOf(checks));
            appliedResults.put(id, result);
            proposals.put(id, new Proposal(proposal.id(), conversation, proposal.workspace(), proposal.summary(), proposal.files(), proposal.createdAt(), true, true, status, proposal.generation()));
            return result;
        } catch (ResponseStatusException failure) { throw failure; }
        catch (IOException failure) {
            // Do not claim transactional filesystem writes or roll back user files blindly.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CODE_WRITE_FAILED; written=" + String.join(",", written));
        }
    }

    /** Capture once, persist before model invocation, and use these exact UTF-8 bytes as context. */
    public CodeGenerationStore.Snapshot prepareGeneration(String principal, UUID conversation, String relative,
                                                          String prototypeVersionId, String prototypeContentHash) {
        if (relative == null || relative.isBlank()) throw rejected("CODE_GENERATION_TARGET_REQUIRED");
        if (generations == null) throw contextUnavailable();
        if (prototypeVersionId == null || prototypeContentHash == null
                || prototypeVersionId.isBlank() != prototypeContentHash.isBlank()) throw contextUnavailable();
        try {
            String source = generationSource(relative);
            var snapshot = new CodeGenerationStore.Snapshot(UUID.randomUUID(), principal, conversation,
                    runtime.workspace().toRealPath().toString(), relative, hash(source), source,
                    prototypeVersionId, prototypeContentHash, Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS));
            generations.save(snapshot);
            if (!snapshot.equals(loadGeneration(snapshot.id()))) throw contextUnavailable();
            return snapshot;
        } catch (ResponseStatusException expected) { throw expected; }
        catch (Exception failure) { throw contextUnavailable(); }
    }

    private CodeGenerationStore.Snapshot loadGeneration(UUID id) {
        if (generations == null) throw contextUnavailable();
        try { return generations.find(id).orElseThrow(CodeChangeService::contextUnavailable); }
        catch (Exception failure) { throw contextUnavailable(); }
    }

    private void verifyGeneration(CodeGenerationStore.Snapshot snapshot) {
        try {
            if (!runtime.workspace().toRealPath().toString().equals(snapshot.workspace()))
                throw rejected("CODE_GENERATION_SCOPE_MISMATCH");
            if (!hash(generationSource(snapshot.targetPath())).equals(snapshot.baseHash()))
                throw new ResponseStatusException(HttpStatus.CONFLICT, "CODE_GENERATION_BASELINE_CHANGED");
        } catch (ResponseStatusException expected) { throw expected; }
        catch (Exception failure) { throw contextUnavailable(); }
    }

    private String generationSource(String relative) throws IOException {
        Path path = target(relative, false);
        // PB02 is deliberately a complete single-file context, not a truncated excerpt.
        if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return null;
        byte[] bytes;
        try (var input = Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS)) { bytes = input.readNBytes(24001); }
        if (bytes.length > 24000) throw contextUnavailable();
        String source = StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(bytes)).toString();
        if (source.indexOf('\0') >= 0 || unsafeSource(source)) throw contextUnavailable();
        target(relative, false); // recheck workspace/symlink boundaries after the read
        return source;
    }

    private static boolean unsafeSource(String source) {
        String lower = source.toLowerCase(Locale.ROOT);
        return com.lh.eap.common.SensitiveData.containsSecret(source)
                || lower.contains("[redacted") || lower.contains("«redacted")
                || lower.contains("private key-----") || lower.matches("(?s).*bearer\\s+[a-z0-9._~+/-]{8,}.*");
    }

    private static ResponseStatusException contextUnavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "CODE_GENERATION_CONTEXT_UNAVAILABLE");
    }

    private Path target(String relative, boolean writing) throws IOException {
        if (relative.isBlank() || relative.length() > 240 || relative.contains("\\") || relative.contains(":")) throw rejected("INVALID_CODE_PATH");
        var parts = relative.split("/", -1);
        for (String part : parts) {
            String key = part.toLowerCase(Locale.ROOT);
            if (key.matches(".*(credential|secret|password|passwd|private[-_]?key|api[-_]?key|certificate|keystore).*")
                    || key.matches(".*tokens?\\.(json|yaml|yml|txt|lock)")) throw rejected("SOURCE_FILES_ONLY");
            if (part.isBlank() || part.startsWith(".") || part.endsWith(".") || part.endsWith(" ")
                    || key.equals("node_modules") || key.equals("target") || key.equals("dist")) throw rejected("INVALID_CODE_PATH");
        }
        String extension = relative.substring(relative.lastIndexOf('.') + 1);
        String policyPath = relative.toLowerCase(Locale.ROOT);
        if (!EXTENSIONS.contains(extension) || policyPath.endsWith("package.json") || policyPath.endsWith("pom.xml")) throw rejected("SOURCE_FILES_ONLY");
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
    private void sweep() {
        proposals.values().removeIf(item -> item.createdAt().isBefore(Instant.now().minusSeconds(1800)));
        appliedResults.keySet().retainAll(proposals.keySet());
    }
    private static String hash(String value) {
        if (value == null) return "absent";
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }
    /** Porcelain path only; ignores status letters and rename arrows. */
    static String dirtyPath(String line) {
        if (line == null || line.isBlank() || line.length() < 4) return "";
        String rest = line.substring(3).strip();
        int arrow = rest.lastIndexOf(" -> ");
        if (arrow >= 0) rest = rest.substring(arrow + 4).strip();
        if (rest.length() >= 2 && rest.charAt(0) == '"' && rest.charAt(rest.length() - 1) == '"') {
            rest = rest.substring(1, rest.length() - 1);
        }
        return rest.replace('\\', '/');
    }
    private static ResponseStatusException rejected(String code) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, code); }


}
